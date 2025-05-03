/**
 * Storage Manager - Module quản lý lưu trữ hỗ trợ cả MinIO và Backblaze B2
 * Sử dụng để chuyển đổi từ từ từ MinIO sang Backblaze B2
 */

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Import các module lưu trữ
const minioUploader = require('./minioUploader');
const b2Uploader = require('./b2Uploader');

dotenv.config();

// Xác định nhà cung cấp lưu trữ mặc định
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'backblaze';

/**
 * Middleware xử lý upload file
 * @param {string} fieldName - Tên trường file trong form
 * @returns {Function} Express middleware
 */
const handleUpload = (fieldName = 'file') => {
  return (req, res, next) => {
    const useB2 = STORAGE_PROVIDER.toLowerCase() === 'backblaze';
    
    if (useB2) {
      console.log('Sử dụng Backblaze B2 cho upload file');
      return b2Uploader.handleUpload(fieldName)(req, res, next);
    } else {
      console.log('Sử dụng MinIO cho upload file');
      return minioUploader.handleUpload(fieldName)(req, res, next);
    }
  };
};

/**
 * Lấy URL file từ storage
 * @param {string} objectName - Tên file trong storage
 * @returns {Promise<Object>} Kết quả với URL file
 */
const getFileFromStorage = async (objectName) => {
  const useB2 = STORAGE_PROVIDER.toLowerCase() === 'backblaze';
  
  try {
    if (useB2) {
      return await b2Uploader.getFileFromB2(objectName);
    } else {
      return await minioUploader.getFileFromMinIO(objectName);
    }
  } catch (error) {
    // Thử phương pháp còn lại nếu phương pháp đầu tiên thất bại
    try {
      if (useB2) {
        console.log('Không tìm thấy file trong B2, thử tìm trong MinIO');
        return await minioUploader.getFileFromMinIO(objectName);
      } else {
        console.log('Không tìm thấy file trong MinIO, thử tìm trong B2');
        return await b2Uploader.getFileFromB2(objectName);
      }
    } catch (fallbackError) {
      return {
        success: false,
        error: `Không tìm thấy file trong cả hai hệ thống lưu trữ: ${error.message} | ${fallbackError.message}`
      };
    }
  }
};

/**
 * Tải file từ storage
 * @param {string} objectName - Tên file trong storage
 * @returns {Promise<Object>} Kết quả với dữ liệu file
 */
const downloadFromStorage = async (objectName) => {
  const useB2 = STORAGE_PROVIDER.toLowerCase() === 'backblaze';
  
  try {
    if (useB2) {
      return await b2Uploader.downloadFromB2(objectName);
    } else {
      return await minioUploader.downloadFromMinIO(objectName);
    }
  } catch (error) {
    // Thử phương pháp còn lại nếu phương pháp đầu tiên thất bại
    try {
      if (useB2) {
        console.log('Không tải được file từ B2, thử tải từ MinIO');
        return await minioUploader.downloadFromMinIO(objectName);
      } else {
        console.log('Không tải được file từ MinIO, thử tải từ B2');
        return await b2Uploader.downloadFromB2(objectName);
      }
    } catch (fallbackError) {
      return {
        success: false,
        error: `Không tải được file từ cả hai hệ thống lưu trữ: ${error.message} | ${fallbackError.message}`
      };
    }
  }
};

/**
 * Xóa file từ storage
 * @param {string} objectName - Tên file trong storage
 * @returns {Promise<Object>} Kết quả xóa file
 */
const deleteFileFromStorage = async (objectName) => {
  const useB2 = STORAGE_PROVIDER.toLowerCase() === 'backblaze';
  let results = [];
  
  // Thử xóa từ cả hai nơi để đảm bảo không còn file trùng lặp
  try {
    if (useB2) {
      const b2Result = await b2Uploader.deleteFileFromB2(objectName);
      results.push({ provider: 'backblaze', result: b2Result });
      
      try {
        const minioResult = await minioUploader.deleteFileFromMinIO(objectName);
        results.push({ provider: 'minio', result: minioResult });
      } catch (minioError) {
        // Bỏ qua lỗi từ MinIO nếu đã xóa thành công từ B2
      }
    } else {
      const minioResult = await minioUploader.deleteFileFromMinIO(objectName);
      results.push({ provider: 'minio', result: minioResult });
      
      try {
        const b2Result = await b2Uploader.deleteFileFromB2(objectName);
        results.push({ provider: 'backblaze', result: b2Result });
      } catch (b2Error) {
        // Bỏ qua lỗi từ B2 nếu đã xóa thành công từ MinIO
      }
    }
    
    // Kiểm tra nếu ít nhất 1 xóa thành công thì trả về thành công
    const anySuccess = results.some(r => r.result.success);
    if (anySuccess) {
      return { success: true, results };
    } else {
      return { 
        success: false, 
        error: 'Không thể xóa file từ cả hai hệ thống lưu trữ',
        results 
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Lỗi khi xóa file: ${error.message}`,
      results
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
  const useB2 = STORAGE_PROVIDER.toLowerCase() === 'backblaze';
  
  if (useB2) {
    return await b2Uploader.uploadCheckedFileToB2(fileBuffer, fileName, type, mimeType);
  } else {
    return await minioUploader.uploadCheckedFileToMinIO(fileBuffer, fileName, type, mimeType);
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