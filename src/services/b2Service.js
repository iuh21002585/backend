/**
 * B2Service - Service để kết nối và làm việc với Backblaze B2
 * Thay thế cho cách sử dụng AWS SDK trước đây
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class B2Service {
  constructor(config) {
    this.config = config;
    this.authData = null;
    this.axios = axios.create({
      timeout: 60000, // 60 giây timeout
    });
  }

  /**
   * Xác thực với Backblaze B2 API
   */
  async authorize() {
    try {
      console.log('B2Service: Đang xác thực với Backblaze B2...');
      // Base64 encode applicationKeyId:applicationKey
      const authString = Buffer.from(
        `${this.config.applicationKeyId}:${this.config.applicationKey}`
      ).toString('base64');

      const response = await axios.get(
        'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
        {
          headers: {
            Authorization: `Basic ${authString}`,
          },
        }
      );

      this.authData = response.data;
      
      // Tạo axios instance mới với token đã xác thực
      this.axios = axios.create({
        baseURL: this.authData.apiUrl,
        headers: {
          Authorization: this.authData.authorizationToken,
        },
        timeout: 60000,
      });

      console.log('B2Service: Xác thực thành công');
      return {
        success: true,
        authData: this.authData
      };
    } catch (error) {
      console.error('B2Service: Lỗi xác thực với Backblaze B2:', error.message);
      return {
        success: false,
        error: `Lỗi xác thực với Backblaze B2: ${error.message}`
      };
    }
  }

  /**
   * Kiểm tra xác thực và thực hiện lại nếu cần thiết
   */
  async ensureAuthorized() {
    if (!this.authData) {
      const authResult = await this.authorize();
      if (!authResult.success) {
        throw new Error(authResult.error);
      }
      return true;
    }
    return true;
  }

  /**
   * Lấy URL upload cho việc tải lên file
   */
  async getUploadUrl() {
    try {
      await this.ensureAuthorized();
      
      const response = await this.axios.post('/b2api/v2/b2_get_upload_url', {
        bucketId: this.config.bucketId
      });
      
      return {
        success: true,
        uploadUrl: response.data.uploadUrl,
        authorizationToken: response.data.authorizationToken
      };
    } catch (error) {
      console.error('B2Service: Lỗi khi lấy URL upload:', error.message);
      
      // Thử xác thực lại nếu token hết hạn
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.authorize();
        try {
          const response = await this.axios.post('/b2api/v2/b2_get_upload_url', {
            bucketId: this.config.bucketId
          });
          
          return {
            success: true,
            uploadUrl: response.data.uploadUrl,
            authorizationToken: response.data.authorizationToken
          };
        } catch (retryError) {
          return {
            success: false,
            error: `Lỗi khi lấy URL upload (sau khi xác thực lại): ${retryError.message}`
          };
        }
      }
      
      return {
        success: false,
        error: `Lỗi khi lấy URL upload: ${error.message}`
      };
    }
  }

  /**
   * Upload file từ đường dẫn cục bộ lên B2
   * @param {string} filePath - Đường dẫn đến file cần upload
   * @param {string} objectName - Tên object trên B2
   */
  async uploadFile(filePath, objectName) {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `File không tồn tại: ${filePath}`
        };
      }

      const fileContent = fs.readFileSync(filePath);
      const fileInfo = path.parse(filePath);
      const mimeType = this._getMimeType(fileInfo.ext);

      return await this.uploadBuffer(fileContent, objectName, mimeType);
    } catch (error) {
      console.error(`B2Service: Lỗi khi upload file ${filePath}:`, error.message);
      return {
        success: false,
        error: `Lỗi khi upload file: ${error.message}`
      };
    }
  }

  /**
   * Upload dữ liệu buffer lên B2
   * @param {Buffer} fileBuffer - Buffer chứa dữ liệu file
   * @param {string} objectName - Tên object trên B2
   * @param {string} contentType - MIME type của file
   */
  async uploadBuffer(fileBuffer, objectName, contentType = 'application/octet-stream') {
    try {
      if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
        return {
          success: false,
          error: `Dữ liệu file không hợp lệ hoặc không phải là Buffer`
        };
      }

      if (!objectName || typeof objectName !== 'string') {
        return {
          success: false,
          error: `Tên file không hợp lệ`
        };
      }

      // Kiểm tra kết nối trước khi tiến hành upload
      if (!this.authData) {
        const authResult = await this.authorize();
        if (!authResult.success) {
          return {
            success: false,
            error: `Không thể xác thực với B2: ${authResult.error || 'Lỗi không xác định'}`
          };
        }
      }

      const uploadUrlResult = await this.getUploadUrl();
      
      if (!uploadUrlResult.success) {
        return uploadUrlResult; // Trả về lỗi từ getUploadUrl
      }
      
      const { uploadUrl, authorizationToken } = uploadUrlResult;
      
      // Kiểm tra nếu authorizationToken không hợp lệ
      if (!authorizationToken) {
        await this.authorize(); // Thử xác thực lại
        return this.uploadBuffer(fileBuffer, objectName, contentType);
      }
      
      // Tính SHA1 hash của file (B2 yêu cầu)
      const crypto = require('crypto');
      const sha1 = crypto.createHash('sha1').update(fileBuffer).digest('hex');
      
      // Upload file
      try {
        const response = await axios.post(uploadUrl, fileBuffer, {
          headers: {
            Authorization: authorizationToken,
            'X-Bz-File-Name': encodeURIComponent(objectName),
            'Content-Type': contentType,
            'X-Bz-Content-Sha1': sha1,
            'X-Bz-Info-Author': 'b2-service'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        
        console.log(`B2Service: Upload thành công: ${objectName}`);
        
        // Tạo URL cho file vừa upload
        const downloadUrl = await this.getFileDownloadUrl(objectName);
        
        return {
          success: true,
          fileId: response.data.fileId,
          objectName: objectName,
          url: downloadUrl.success ? downloadUrl.url : null
        };
      } catch (uploadError) {
        console.error(`B2Service: Lỗi khi upload file lên B2: ${uploadError.message}`);
        
        // Chi tiết lỗi cho việc debug
        const errorDetails = uploadError.response?.data ? JSON.stringify(uploadError.response.data) : 'Không có chi tiết';
        console.error(`Chi tiết lỗi: ${errorDetails}`);
        
        // Thử xác thực lại nếu token hết hạn
        if (axios.isAxiosError(uploadError) && uploadError.response?.status === 401) {
          await this.authorize();
          try {
            return await this.uploadBuffer(fileBuffer, objectName, contentType);
          } catch (retryError) {
            return {
              success: false,
              error: `Lỗi khi upload file (sau khi xác thực lại): ${retryError.message}`
            };
          }
        }
        
        return {
          success: false,
          error: `Lỗi khi upload file lên B2: ${uploadError.message}`
        };
      }
    } catch (error) {
      console.error(`B2Service: Lỗi khi upload buffer cho ${objectName}:`, error.message);
      return {
        success: false,
        error: `Lỗi khi upload buffer: ${error.message}`
      };
    }
  }

  /**
   * Liệt kê files trong bucket
   * @param {string} prefix - Tiền tố để lọc files
   * @param {number} maxFileCount - Số lượng files tối đa muốn lấy
   */
  async listFiles(prefix = '', maxFileCount = 1000) {
    try {
      await this.ensureAuthorized();
      
      const response = await this.axios.post('/b2api/v2/b2_list_file_names', {
        bucketId: this.config.bucketId,
        maxFileCount,
        prefix
      });
      
      return {
        success: true,
        files: response.data.files,
        nextFileName: response.data.nextFileName
      };
    } catch (error) {
      console.error('B2Service: Lỗi khi liệt kê files:', error.message);
      
      // Thử xác thực lại nếu token hết hạn
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.authorize();
        try {
          const response = await this.axios.post('/b2api/v2/b2_list_file_names', {
            bucketId: this.config.bucketId,
            maxFileCount,
            prefix
          });
          
          return {
            success: true,
            files: response.data.files,
            nextFileName: response.data.nextFileName
          };
        } catch (retryError) {
          return {
            success: false,
            error: `Lỗi khi liệt kê files (sau khi xác thực lại): ${retryError.message}`
          };
        }
      }
      
      return {
        success: false,
        error: `Lỗi khi liệt kê files: ${error.message}`
      };
    }
  }

  /**
   * Lấy thông tin file theo tên
   * @param {string} objectName - Tên file cần lấy thông tin
   */
  async getFileInfo(objectName) {
    try {
      const listResult = await this.listFiles(objectName, 1);
      
      if (!listResult.success) {
        return listResult; // Trả về lỗi từ listFiles
      }
      
      const exactMatch = listResult.files.find(file => file.fileName === objectName);
      
      if (exactMatch) {
        return {
          success: true,
          fileInfo: exactMatch
        };
      } else {
        return {
          success: false,
          error: `Không tìm thấy file: ${objectName}`
        };
      }
    } catch (error) {
      console.error(`B2Service: Lỗi khi lấy thông tin file ${objectName}:`, error.message);
      return {
        success: false,
        error: `Lỗi khi lấy thông tin file: ${error.message}`
      };
    }
  }

  /**
   * Tạo URL download cho file
   * @param {string} objectName - Tên file cần lấy URL
   */
  async getFileDownloadUrl(objectName) {
    try {
      await this.ensureAuthorized();
      
      // Kiểm tra file tồn tại
      const fileInfo = await this.getFileInfo(objectName);
      if (!fileInfo.success) {
        return {
          success: false,
          error: `Không thể tạo URL download: ${fileInfo.error}`
        };
      }
      
      // Tạo URL download
      const downloadUrl = `${this.authData.downloadUrl}/file/${this.config.bucketName}/${encodeURIComponent(objectName)}`;
      
      return {
        success: true,
        url: downloadUrl
      };
    } catch (error) {
      console.error(`B2Service: Lỗi khi tạo URL download cho ${objectName}:`, error.message);
      return {
        success: false,
        error: `Lỗi khi tạo URL download: ${error.message}`
      };
    }
  }

  /**
   * Tạo URL download với token tạm thời
   * @param {string} objectName - Tên file cần lấy URL
   * @param {number} expirySeconds - Thời gian hiệu lực của URL (giây)
   */
  async getPresignedUrl(objectName, expirySeconds = 3600) {
    try {
      await this.ensureAuthorized();
      
      // Lấy thông tin file để đảm bảo file tồn tại
      const fileInfo = await this.getFileInfo(objectName);
      if (!fileInfo.success) {
        return {
          success: false,
          error: `Không thể tạo URL presigned: ${fileInfo.error}`
        };
      }

      // Sử dụng API b2_get_download_authorization để tạo download token
      const authResponse = await this.axios.post('/b2api/v2/b2_get_download_authorization', {
        bucketId: this.config.bucketId,
        fileNamePrefix: objectName,
        validDurationInSeconds: expirySeconds
      });
      
      // Tạo presigned URL với token
      const downloadUrl = `${this.authData.downloadUrl}/file/${this.config.bucketName}/${encodeURIComponent(objectName)}?Authorization=${authResponse.data.authorizationToken}`;
      
      return {
        success: true,
        url: downloadUrl,
        expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString()
      };
    } catch (error) {
      console.error(`B2Service: Lỗi khi tạo presigned URL cho ${objectName}:`, error.message);
      
      // Thử xác thực lại nếu token hết hạn
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.authorize();
        try {
          return await this.getPresignedUrl(objectName, expirySeconds);
        } catch (retryError) {
          return {
            success: false,
            error: `Lỗi khi tạo presigned URL (sau khi xác thực lại): ${retryError.message}`
          };
        }
      }
      
      return {
        success: false,
        error: `Lỗi khi tạo presigned URL: ${error.message}`
      };
    }
  }

  /**
   * Tải file từ B2
   * @param {string} objectName - Tên file cần tải
   */
  async downloadFile(objectName) {
    try {
      await this.ensureAuthorized();
      
      // Lấy URL download
      const urlResult = await this.getFileDownloadUrl(objectName);
      if (!urlResult.success) {
        return urlResult; // Trả về lỗi từ getFileDownloadUrl
      }
      
      // Tải file
      const response = await axios.get(urlResult.url, {
        headers: {
          Authorization: this.authData.authorizationToken
        },
        responseType: 'arraybuffer'
      });
      
      return {
        success: true,
        data: response.data,
        contentType: response.headers['content-type']
      };
    } catch (error) {
      console.error(`B2Service: Lỗi khi tải file ${objectName}:`, error.message);
      
      // Thử xác thực lại nếu token hết hạn
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.authorize();
        try {
          return await this.downloadFile(objectName);
        } catch (retryError) {
          return {
            success: false,
            error: `Lỗi khi tải file (sau khi xác thực lại): ${retryError.message}`
          };
        }
      }
      
      return {
        success: false,
        error: `Lỗi khi tải file: ${error.message}`
      };
    }
  }

  /**
   * Xóa file từ B2
   * @param {string} objectName - Tên file cần xóa
   */
  async deleteFile(objectName) {
    try {
      await this.ensureAuthorized();
      
      // Lấy thông tin file để xác định fileId
      const fileInfo = await this.getFileInfo(objectName);
      if (!fileInfo.success) {
        return {
          success: false,
          error: `Không thể xóa file: ${fileInfo.error}`
        };
      }
      
      // Xóa file bằng cách sử dụng fileId
      await this.axios.post('/b2api/v2/b2_delete_file_version', {
        fileId: fileInfo.fileInfo.fileId,
        fileName: objectName
      });
      
      return {
        success: true
      };
    } catch (error) {
      console.error(`B2Service: Lỗi khi xóa file ${objectName}:`, error.message);
      
      // Thử xác thực lại nếu token hết hạn
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.authorize();
        try {
          return await this.deleteFile(objectName);
        } catch (retryError) {
          return {
            success: false,
            error: `Lỗi khi xóa file (sau khi xác thực lại): ${retryError.message}`
          };
        }
      }
      
      return {
        success: false,
        error: `Lỗi khi xóa file: ${error.message}`
      };
    }
  }

  /**
   * Xác định MIME type dựa vào phần mở rộng file
   * @private
   */
  _getMimeType(extension) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.rtf': 'application/rtf',
      '.odt': 'application/vnd.oasis.opendocument.text',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

module.exports = B2Service;