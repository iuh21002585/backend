/**
 * Storage Manager - Module quản lý lưu trữ sử dụng Backblaze B2
 */

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Import module lưu trữ
const b2Uploader = require('./b2Uploader');

dotenv.config();

// Sử dụng Backblaze B2 làm nhà cung cấp lưu trữ duy nhất
const STORAGE_PROVIDER = 'backblaze';

/**
 * Middleware xử lý upload file
 * @param {string} fieldName - Tên trường file trong form
 * @returns {Function} Express middleware
 */
const handleUpload = (fieldName = 'file') => {
  return b2Uploader.handleUpload(fieldName);
};

/**
 * Lấy URL file từ storage
 * @param {string} objectName - Tên file trong storage
 * @returns {Promise<Object>} Kết quả với URL file
 */
const getFileFromStorage = async (objectName) => {
  try {
    return await b2Uploader.getPresignedDownloadUrl(objectName);
  } catch (error) {
    return {
      success: false,
      error: `Không tìm thấy file trong B2: ${error.message}`
    };
  }
};

/**
 * Tải file từ storage
 * @param {string} objectName - Tên file trong storage
 * @returns {Promise<Object>} Kết quả với dữ liệu file
 */
const downloadFromStorage = async (objectName) => {
  try {
    // Use the getPresignedDownloadUrl function since downloadFromB2 is not defined
    const downloadUrl = await b2Uploader.getPresignedDownloadUrl(objectName);
    return {
      success: true,
      url: downloadUrl,
      provider: 'backblaze'
    };
  } catch (error) {
    return {
      success: false,
      error: `Không tải được file từ B2: ${error.message}`
    };
  }
};

/**
 * Xóa file từ storage
 * @param {string} objectName - Tên file trong storage
 * @returns {Promise<Object>} Kết quả xóa file
 */
const deleteFileFromStorage = async (objectName) => {
  try {
    const b2Result = await b2Uploader.deleteFromB2(objectName);
    return { 
      success: b2Result.success, 
      provider: 'backblaze', 
      result: b2Result 
    };
  } catch (error) {
    return {
      success: false,
      error: `Lỗi khi xóa file từ B2: ${error.message}`
    };
  }
};

/**
 * Upload file báo cáo đạo văn lên storage
 * @param {Buffer} fileBuffer - Buffer chứa dữ liệu file
 * @param {string} fileName - Tên file
 * @param {string} type - Loại báo cáo ('traditional' hoặc 'ai')
 * @param {string} mimeType - MIME type của file
 * @returns {Promise<Object>} Kết quả upload
 */
const uploadCheckedFileToStorage = async (fileBuffer, fileName, type, mimeType = 'application/pdf') => {
  // Save buffer to a temporary file
  const tempDir = 'uploads/temp';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempFilePath = path.join(tempDir, fileName);
  fs.writeFileSync(tempFilePath, fileBuffer);
  
  try {
    // Use the correct function to upload checked file to B2
    const result = await b2Uploader.uploadCheckedFileToB2(
      tempFilePath,
      'checked-theses',
      type
    );
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    return result;
  } catch (error) {
    // Clean up temp file in case of error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    return {
      success: false,
      error: `Lỗi khi upload file báo cáo đạo văn: ${error.message}`
    };
  }
};

module.exports = {
  handleUpload,
  getFileFromStorage,
  downloadFromStorage,
  deleteFileFromStorage,
  uploadCheckedFileToStorage,
  STORAGE_PROVIDER
};