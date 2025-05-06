const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const path = require('path');
const crypto = require('crypto');
const B2 = require('backblaze-b2');

class B2Service {
  constructor(config) {
    this.applicationKeyId = config.applicationKeyId;
    this.applicationKey = config.applicationKey;
    this.bucketId = config.bucketId;
    this.bucketName = config.bucketName;
    
    // Khởi tạo SDK backblaze-b2
    this.b2 = new B2({
      applicationKeyId: this.applicationKeyId,
      applicationKey: this.applicationKey
    });
    
    this.authToken = null;
    this.apiUrl = null;
    this.downloadUrl = null;
    
    this.lastAuthTime = null;
    this.authTokenDuration = 23.5 * 60 * 60 * 1000; // 23.5 giờ (tokens B2 hết hạn sau 24h)
    
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 giây độ trễ ban đầu
  }

  /**
   * Kiểm tra xem token xác thực còn hợp lệ không
   */
  isAuthValid() {
    if (!this.authToken || !this.lastAuthTime) return false;
    
    const now = Date.now();
    const elapsed = now - this.lastAuthTime;
    return elapsed < this.authTokenDuration;
  }

  /**
   * Xác thực với API B2 và lấy tokens, URLs cần thiết
   */
  async authorize() {
    try {
      console.log('Đang xác thực với B2 API...');
      
      // Kiểm tra thông tin đăng nhập có đầy đủ không
      if (!this.applicationKeyId || !this.applicationKey) {
        console.error('LỖI: Thiếu thông tin xác thực B2 (applicationKeyId hoặc applicationKey)');
        throw new Error('Thiếu thông tin xác thực B2. Kiểm tra biến môi trường.');
      }
      
      // Sử dụng phương pháp truyền thống với axios thay vì SDK (do vấn đề về cấu trúc dữ liệu trong SDK)
      const authResponse = await axios({
        method: 'get',
        url: 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
        auth: {
          username: this.applicationKeyId,
          password: this.applicationKey
        },
        headers: {
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 giây timeout
      });

      const { data } = authResponse;
      
      if (!data || !data.authorizationToken || !data.apiUrl || !data.downloadUrl) {
        console.error('Phản hồi không hợp lệ từ B2 authorization:', data);
        throw new Error('Phản hồi không hợp lệ từ B2 authorization');
      }
      
      this.authToken = data.authorizationToken;
      this.apiUrl = data.apiUrl;
      this.downloadUrl = data.downloadUrl;
      this.lastAuthTime = Date.now();
      
      console.log('Xác thực với B2 API thành công!');
      console.log(`URL API: ${this.apiUrl}`);
      console.log(`URL Download: ${this.downloadUrl}`);
      return true;
    } catch (error) {
      console.error('Lỗi xác thực B2:', error.message);
      if (error.response) {
        console.error('Trạng thái phản hồi:', error.response.status);
        console.error('Dữ liệu phản hồi:', JSON.stringify(error.response.data));
      } else if (error.request) {
        console.error('Không nhận được phản hồi từ B2:', error.request);
        console.error('Hết thời gian chờ hoặc lỗi mạng');
      } else {
        console.error('Lỗi thiết lập yêu cầu:', error.message);
      }
      
      this.authToken = null;
      this.apiUrl = null;
      this.downloadUrl = null;
      this.lastAuthTime = null;
      throw new Error(`Xác thực B2 thất bại: ${error.message}`);
    }
  }

  /**
   * Đảm bảo có token xác thực hợp lệ trước khi tiếp tục
   */
  async ensureAuthorized() {
    try {
      if (!this.isAuthValid()) {
        await this.authorize();
      }
      return this.authToken !== null;
    } catch (error) {
      console.error('Lỗi khi xác thực với B2:', error);
      throw error;
    }
  }

  /**
   * Get an upload URL for a B2 bucket
   */
  async getUploadUrl() {
    await this.ensureAuthorized();
    
    try {
      const response = await axios({
        method: 'post',
        url: `${this.apiUrl}/b2api/v2/b2_get_upload_url`,
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        data: {
          bucketId: this.bucketId
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting B2 upload URL:', error.message);
      
      // If authorization expired, retry once with new auth token
      if (error.response && error.response.status === 401) {
        console.log('Auth token expired, refreshing...');
        await this.authorize();
        
        const response = await axios({
          method: 'post',
          url: `${this.apiUrl}/b2api/v2/b2_get_upload_url`,
          headers: {
            'Authorization': this.authToken,
            'Content-Type': 'application/json'
          },
          data: {
            bucketId: this.bucketId
          }
        });
        
        return response.data;
      }
      
      throw new Error(`Failed to get upload URL: ${error.message}`);
    }
  }

  /**
   * Calculate SHA1 hash for a file
   * @param {string} filePath Path to the file
   */
  async calculateSha1(filePath) {
    return new Promise((resolve, reject) => {
      const shasum = crypto.createHash('sha1');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => {
        shasum.update(data);
      });
      
      stream.on('end', () => {
        resolve(shasum.digest('hex'));
      });
      
      stream.on('error', err => {
        reject(err);
      });
    });
  }

  /**
   * Mã hóa tên file cho API B2
   * Xử lý đúng ký tự tiếng Việt và ký tự đặc biệt
   * @param {string} fileName Tên file cần mã hóa
   * @returns {string} Tên file đã mã hóa an toàn
   */
  encodeB2FileName(fileName) {
    try {
      // Chuẩn hóa chuỗi theo dạng NFC - khuyến nghị cho tiếng Việt
      const normalizedName = fileName.normalize('NFC');
      
      // Áp dụng URL encoding - sử dụng encodeURIComponent để xử lý tiếng Việt và ký tự đặc biệt
      return encodeURIComponent(normalizedName);
    } catch (error) {
      console.error('Lỗi khi mã hóa tên file:', error.message);
      // Sử dụng phương thức mã hóa cơ bản nếu có lỗi
      return encodeURIComponent(fileName);
    }
  }

  /**
   * Handle file upload with retries
   * @param {string} filePath Path to local file
   * @param {string} b2FileName Desired filename in B2
   * @param {number} retryCount Current retry attempt
   */
  async uploadFileWithRetry(filePath, b2FileName, retryCount = 0) {
    try {
      await this.ensureAuthorized();
      
      const uploadUrlData = await this.getUploadUrl();
      const uploadUrl = uploadUrlData.uploadUrl;
      const uploadAuthToken = uploadUrlData.authorizationToken;
      
      const fileBuffer = await fsReadFile(filePath);
      const sha1 = await this.calculateSha1(filePath);
      const mimeType = this.getMimeType(path.extname(filePath));
      
      // Ensure proper encoding of filename for B2
      const normalizedB2FileName = b2FileName.normalize('NFC');
      const encodedFileName = this.encodeB2FileName(normalizedB2FileName);
      
      console.log(`Uploading file to B2: ${normalizedB2FileName}`);
      console.log(`Encoded filename: ${encodedFileName}`);
      
      const uploadResponse = await axios({
        method: 'post',
        url: uploadUrl,
        headers: {
          'Authorization': uploadAuthToken,
          'Content-Type': mimeType,
          'Content-Length': fileBuffer.length,
          'X-Bz-File-Name': encodedFileName,
          'X-Bz-Content-Sha1': sha1
        },
        data: fileBuffer,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      const fileUrl = `${this.downloadUrl}/file/${this.bucketName}/${encodedFileName}`;
      
      return {
        success: true,
        fileId: uploadResponse.data.fileId,
        fileName: normalizedB2FileName,
        url: fileUrl,
        sha1: sha1,
        contentType: mimeType
      };
    } catch (error) {
      console.error(`Upload attempt ${retryCount + 1} failed:`, error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      // Check if we've reached max retries
      if (retryCount >= this.maxRetries) {
        console.error(`Max retries (${this.maxRetries}) reached, giving up`);
        return {
          success: false,
          error: `Failed after ${this.maxRetries} attempts: ${error.message}`
        };
      }
      
      // Handle auth errors by refreshing authentication
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log('Auth error during upload, refreshing token...');
        await this.authorize();
      }
      
      // Exponential backoff for retries
      const delay = this.retryDelay * Math.pow(2, retryCount);
      console.log(`Retrying upload in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.uploadFileWithRetry(filePath, b2FileName, retryCount + 1);
    }
  }

  /**
   * Upload a file to B2
   * @param {string} filePath Path to local file
   * @param {string} b2FileName Desired filename in B2
   */
  async uploadFile(filePath, b2FileName) {
    return this.uploadFileWithRetry(filePath, b2FileName);
  }

  /**
   * Tạo URL download có xác thực cho file
   * @param {string} fileName Tên file trong B2
   * @returns {Promise<string>} URL download có xác thực
   */
  async getAuthenticatedDownloadUrl(fileName) {
    await this.ensureAuthorized();
    
    if (!this.downloadUrl || !this.bucketName) {
      throw new Error('B2 service chưa được khởi tạo đúng, thiếu downloadUrl hoặc bucketName');
    }
    
    try {
      console.log(`Tạo URL download có xác thực cho file: ${fileName}`);
      
      // Sử dụng API B2 trực tiếp qua axios
      const response = await axios({
        method: 'post',
        url: `${this.apiUrl}/b2api/v2/b2_get_download_authorization`,
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        data: {
          bucketId: this.bucketId,
          fileNamePrefix: fileName,
          validDurationInSeconds: 86400 // 24 giờ
        }
      });
      
      // Chuẩn hóa tên file
      const normalizedFileName = fileName.normalize('NFC');
      const encodedFileName = this.encodeB2FileName(normalizedFileName);
      
      // Tạo URL tải xuống có token xác thực
      const downloadUrl = `${this.downloadUrl}/file/${this.bucketName}/${encodedFileName}?Authorization=${response.data.authorizationToken}`;
      
      console.log('URL download có xác thực đã được tạo thành công');
      return downloadUrl;
    } catch (error) {
      console.error('Lỗi lấy xác thực download:', error);
      
      // Thử lại nếu token xác thực hết hạn
      if (error.response && error.response.status === 401) {
        console.log('Token xác thực hết hạn, đang làm mới...');
        await this.authorize();
        
        try {
          const response = await axios({
            method: 'post',
            url: `${this.apiUrl}/b2api/v2/b2_get_download_authorization`,
            headers: {
              'Authorization': this.authToken,
              'Content-Type': 'application/json'
            },
            data: {
              bucketId: this.bucketId,
              fileNamePrefix: fileName,
              validDurationInSeconds: 86400
            }
          });
          
          const normalizedFileName = fileName.normalize('NFC');
          const encodedFileName = this.encodeB2FileName(normalizedFileName);
          
          const downloadUrl = `${this.downloadUrl}/file/${this.bucketName}/${encodedFileName}?Authorization=${response.data.authorizationToken}`;
          console.log('URL download có xác thực đã được tạo thành công (sau khi làm mới token)');
          
          return downloadUrl;
        } catch (retryError) {
          console.error('Không thể lấy token download sau khi làm mới xác thực:', retryError);
          throw new Error(`Không thể lấy URL tải xuống: ${retryError.message}`);
        }
      }
      
      throw new Error(`Không thể lấy URL tải xuống: ${error.message}`);
    }
  }

  /**
   * Tải file từ B2 theo tên và lưu vào đường dẫn local
   * @param {string} fileName Tên file trong B2
   * @param {string} localFilePath Đường dẫn lưu file local
   * @returns {Promise<Object>} Kết quả với thông tin thành công/thất bại
   */
  async downloadFileByName(fileName, localFilePath) {
    try {
      // Tạo URL download có xác thực
      const downloadUrl = await this.getAuthenticatedDownloadUrl(fileName);
      console.log(`Đang tải file từ URL xác thực: ${downloadUrl}`);
      
      // Đảm bảo thư mục tồn tại
      const dir = path.dirname(localFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Tạo write stream để lưu file
      const writer = fs.createWriteStream(localFilePath);
      
      // Sử dụng axios để tải file
      const response = await axios({
        method: 'get',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 60000, // 60 giây timeout
        maxContentLength: 100 * 1024 * 1024 // Cho phép tối đa 100MB
      });
      
      // Ghi dữ liệu phản hồi vào file
      response.data.pipe(writer);
      
      // Trả về promise hoàn thành khi tải xong
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          // Kiểm tra kích thước file để đảm bảo nó không rỗng
          fs.stat(localFilePath, (err, stats) => {
            if (err) {
              reject(err);
              return;
            }
            
            if (stats.size === 0) {
              fs.unlinkSync(localFilePath);
              reject(new Error('File tải về rỗng'));
              return;
            }
            
            console.log(`File tải về thành công: ${localFilePath} (${stats.size} bytes)`);
            resolve({
              success: true,
              filePath: localFilePath,
              contentType: response.headers['content-type'],
              size: stats.size
            });
          });
        });
        
        writer.on('error', (err) => {
          console.error('Lỗi khi ghi file: ', err.message);
          if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
          }
          reject(err);
        });
      });
    } catch (error) {
      console.error('Lỗi khi tải file từ B2:', error.message);
      
      if (error.response) {
        console.error('Trạng thái phản hồi:', error.response.status);
        console.error('Headers phản hồi:', JSON.stringify(error.response.headers));
      }
      
      // Xóa file nếu tải một phần
      if (fs.existsSync(localFilePath)) {
        try {
          fs.unlinkSync(localFilePath);
          console.log(`Đã xóa file tải xuống không hoàn chỉnh: ${localFilePath}`);
        } catch (unlinkError) {
          console.error('Không thể xóa file tải xuống không hoàn chỉnh:', unlinkError.message);
        }
      }
      
      return {
        success: false,
        error: `Không thể tải file: ${error.message}`
      };
    }
  }

  /**
   * Delete a file from B2
   * @param {string} fileId B2 file ID
   * @param {string} fileName File name in B2
   */
  async deleteFile(fileId, fileName) {
    await this.ensureAuthorized();
    
    try {
      const response = await axios({
        method: 'post',
        url: `${this.apiUrl}/b2api/v2/b2_delete_file_version`,
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        data: {
          fileId: fileId,
          fileName: fileName
        }
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error deleting file:', error.message);
      
      // Try with refreshed auth if it's an authorization error
      if (error.response && error.response.status === 401) {
        await this.authorize();
        
        try {
          const response = await axios({
            method: 'post',
            url: `${this.apiUrl}/b2api/v2/b2_delete_file_version`,
            headers: {
              'Authorization': this.authToken,
              'Content-Type': 'application/json'
            },
            data: {
              fileId: fileId,
              fileName: fileName
            }
          });
          
          return { success: true, data: response.data };
        } catch (retryError) {
          return { success: false, error: `Failed to delete file: ${retryError.message}` };
        }
      }
      
      return { success: false, error: `Failed to delete file: ${error.message}` };
    }
  }

  /**
   * List files in a bucket
   * @param {number} maxFileCount Maximum number of files to list
   * @param {string} startFileName File name to start listing from
   */
  async listFiles(maxFileCount = 1000, startFileName = null) {
    await this.ensureAuthorized();
    
    try {
      const requestData = {
        bucketId: this.bucketId,
        maxFileCount: maxFileCount
      };
      
      if (startFileName) {
        requestData.startFileName = startFileName;
      }
      
      const response = await axios({
        method: 'post',
        url: `${this.apiUrl}/b2api/v2/b2_list_file_names`,
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        data: requestData
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error listing files:', error.message);
      
      // Try with refreshed auth if it's an authorization error
      if (error.response && error.response.status === 401) {
        await this.authorize();
        
        try {
          const requestData = {
            bucketId: this.bucketId,
            maxFileCount: maxFileCount
          };
          
          if (startFileName) {
            requestData.startFileName = startFileName;
          }
          
          const response = await axios({
            method: 'post',
            url: `${this.apiUrl}/b2api/v2/b2_list_file_names`,
            headers: {
              'Authorization': this.authToken,
              'Content-Type': 'application/json'
            },
            data: requestData
          });
          
          return { success: true, data: response.data };
        } catch (retryError) {
          return { success: false, error: `Failed to list files: ${retryError.message}` };
        }
      }
      
      return { success: false, error: `Failed to list files: ${error.message}` };
    }
  }

  /**
   * Get file info from B2
   * @param {string} fileId B2 file ID
   */
  async getFileInfo(fileId) {
    await this.ensureAuthorized();
    
    try {
      const response = await axios({
        method: 'post',
        url: `${this.apiUrl}/b2api/v2/b2_get_file_info`,
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        data: {
          fileId: fileId
        }
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error getting file info:', error.message);
      
      // Try with refreshed auth if it's an authorization error
      if (error.response && error.response.status === 401) {
        await this.authorize();
        
        try {
          const response = await axios({
            method: 'post',
            url: `${this.apiUrl}/b2api/v2/b2_get_file_info`,
            headers: {
              'Authorization': this.authToken,
              'Content-Type': 'application/json'
            },
            data: {
              fileId: fileId
            }
          });
          
          return { success: true, data: response.data };
        } catch (retryError) {
          return { success: false, error: `Failed to get file info: ${retryError.message}` };
        }
      }
      
      return { success: false, error: `Failed to get file info: ${error.message}` };
    }
  }

  /**
   * Get the MIME type based on file extension
   * @param {string} extension File extension
   * @returns {string} MIME type
   */
  getMimeType(extension) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.odt': 'application/vnd.oasis.opendocument.text',
      '.txt': 'text/plain',
      '.rtf': 'application/rtf',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

module.exports = B2Service;