const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const path = require('path');
const crypto = require('crypto');

class B2Service {
  constructor(config) {
    this.applicationKeyId = config.applicationKeyId;
    this.applicationKey = config.applicationKey;
    this.bucketId = config.bucketId;
    this.bucketName = config.bucketName;
    
    this.authToken = null;
    this.apiUrl = null;
    this.downloadUrl = null;
    
    this.lastAuthTime = null;
    this.authTokenDuration = 23.5 * 60 * 60 * 1000; // 23.5 hours in milliseconds (B2 tokens expire after 24h)
    
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second initial delay
  }

  /**
   * Check if the authentication token is still valid
   */
  isAuthValid() {
    if (!this.authToken || !this.lastAuthTime) return false;
    
    const now = Date.now();
    const elapsed = now - this.lastAuthTime;
    return elapsed < this.authTokenDuration;
  }

  /**
   * Authorize with B2 API and get necessary tokens and URLs
   */
  async authorize() {
    try {
      console.log('Authorizing with B2 API...');
      
      // Check if required credentials are present
      if (!this.applicationKeyId || !this.applicationKey) {
        console.error('ERROR: Missing B2 credentials (applicationKeyId or applicationKey)');
        throw new Error('Missing B2 credentials. Check environment variables.');
      }
      
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
        timeout: 10000 // 10 second timeout
      });

      const { data } = authResponse;
      
      if (!data.authorizationToken || !data.apiUrl || !data.downloadUrl) {
        console.error('Invalid response from B2 authorization:', data);
        throw new Error('Invalid response from B2 authorization');
      }
      
      this.authToken = data.authorizationToken;
      this.apiUrl = data.apiUrl;
      this.downloadUrl = data.downloadUrl;
      this.lastAuthTime = Date.now();
      
      console.log('Successfully authorized with B2 API');
      console.log(`API URL: ${this.apiUrl}`);
      console.log(`Download URL: ${this.downloadUrl}`);
      return true;
    } catch (error) {
      console.error('B2 Authorization error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      } else if (error.request) {
        // Request was made but no response was received
        console.error('No response received from B2:', error.request);
        console.error('Request timeout or network error');
      } else {
        console.error('Error setting up request:', error.message);
      }
      
      this.authToken = null;
      this.apiUrl = null;
      this.downloadUrl = null;
      this.lastAuthTime = null;
      throw new Error(`B2 Authorization failed: ${error.message}`);
    }
  }

  /**
   * Make sure we have a valid authorization token before proceeding
   */
  async ensureAuthorized() {
    if (!this.isAuthValid()) {
      await this.authorize();
    }
    return this.authToken !== null;
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
   * Properly encode a filename for B2 API
   * Handles Vietnamese and special characters correctly
   * @param {string} fileName The filename to encode
   * @returns {string} Properly encoded filename
   */
  encodeB2FileName(fileName) {
    try {
      // First normalize the string to NFC form which is recommended for Vietnamese
      const normalizedName = fileName.normalize('NFC');
      
      // Apply URL encoding - using encodeURIComponent to handle Vietnamese and special chars
      return encodeURIComponent(normalizedName);
    } catch (error) {
      console.error('Error encoding filename:', error.message);
      // Fall back to basic encoding if there's an error
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
   * Download a file from B2
   * @param {string} fileId B2 file ID
   * @param {string} localPath Path where to save the file
   */
  async downloadFile(fileId, localPath) {
    await this.ensureAuthorized();
    
    try {
      const response = await axios({
        method: 'post',
        url: `${this.apiUrl}/b2api/v2/b2_download_file_by_id`,
        headers: {
          'Authorization': this.authToken
        },
        data: {
          fileId: fileId
        },
        responseType: 'stream'
      });
      
      // Create write stream and pipe the response data
      const writer = fs.createWriteStream(localPath);
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(true));
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('Error downloading file:', error.message);
      throw new Error(`Failed to download file: ${error.message}`);
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

  /**
   * Get a download URL for a file
   * @param {string} fileName File name in B2
   * @returns {string} Download URL
   */
  getDownloadUrl(fileName) {
    if (!this.downloadUrl || !this.bucketName) {
      throw new Error('B2 service not properly initialized, missing downloadUrl or bucketName');
    }
    
    // Normalize and encode the filename for URL
    const normalizedFileName = fileName.normalize('NFC');
    const encodedFileName = this.encodeB2FileName(normalizedFileName);
    
    return `${this.downloadUrl}/file/${this.bucketName}/${encodedFileName}`;
  }
}

module.exports = B2Service;