const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
// Replace the import with the B2Service
const B2Service = require('../services/b2Service');
const { promisify } = require('util');
const fsUnlink = promisify(fs.unlink);
const fsExists = promisify(fs.exists);

// Initialize B2 service with config from environment variables
const b2Service = new B2Service({
  applicationKeyId: process.env.B2_ACCESS_KEY_ID,
  applicationKey: process.env.B2_SECRET_ACCESS_KEY,
  bucketId: process.env.B2_BUCKET_ID,
  bucketName: process.env.B2_BUCKET_NAME
});

// Cấu hình lưu trữ tạm thời cho multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = 'uploads/temp';
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Improved Vietnamese filename encoding handling
    let originalName;
    try {
      // First try to decode from latin1 to utf8, which helps with Vietnamese characters
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      
      // Normalize Unicode for consistent representation (NFC is the recommended form for Vietnamese)
      originalName = originalName.normalize('NFC');
    } catch (e) {
      // Fallback to original name if conversion fails
      originalName = file.originalname;
      console.warn('Vietnamese filename conversion failed:', e.message);
    }
    
    const timestamp = Date.now();
    const fileExt = path.extname(originalName);
    const safeFilename = `${file.fieldname}-${timestamp}${fileExt}`;
    
    // Store the original name and safe name in the request for later use
    if (!req.fileInfo) req.fileInfo = {};
    req.fileInfo[file.fieldname] = {
      originalName,
      safeFilename,
      timestamp
    };
    
    cb(null, safeFilename);
  },
});

// Kiểm tra loại file
const checkFileType = (req, file, cb) => {
  // Các loại file được hỗ trợ
  const supportedMimeTypes = [
    'application/pdf',                                              // PDF
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/msword',                                           // DOC
    'application/vnd.oasis.opendocument.text',                      // ODT
    'text/plain',                                                   // TXT
    'application/rtf',                                              // RTF
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.ms-powerpoint',                                // PPT
  ];
  
  if (supportedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  } else {
    return cb(new Error('Chỉ chấp nhận các file PDF, DOCX, DOC, ODT, TXT, RTF, PPTX và PPT'), false);
  }
};

// Create multer upload middleware with file type checking
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: checkFileType
});

/**
 * Sanitize filename for safe storage in B2
 * @param {string} filename - The original filename
 * @returns {string} - A sanitized filename safe for B2 storage
 */
const sanitizeFilename = (filename) => {
  if (!filename) return `file-${Date.now()}`;

  try {
    // First ensure the filename is properly normalized for Vietnamese characters
    const normalizedName = filename.normalize('NFC');
    
    // Replace problematic characters but preserve Vietnamese characters
    // by replacing only symbols and spaces with underscores
    return normalizedName
      .replace(/[/\\?%*:|"<>]/g, '_')  // Replace disallowed chars with underscores
      .replace(/\s+/g, '_');  // Replace spaces with underscores
  } catch (error) {
    console.error('Error sanitizing filename:', error.message);
    // Return a safe fallback name
    return `file-${Date.now()}`;
  }
};

/**
 * Safely decode filename from various encodings
 * @param {string} filename - The encoded filename
 * @returns {string} - A properly decoded filename
 */
const decodeFilename = (filename) => {
  if (!filename) return '';
  
  try {
    // Try multiple conversion approaches for Vietnamese characters
    let decoded;
    
    // First approach: latin1 to utf8 conversion
    try {
      decoded = Buffer.from(filename, 'latin1').toString('utf8');
    } catch (e) {
      // If that fails, use the original
      decoded = filename;
    }
    
    // Always normalize to NFC form for Vietnamese characters
    return decoded.normalize('NFC');
  } catch (error) {
    console.error('Error decoding filename:', error.message);
    return filename; // Return original on error
  }
};

/**
 * Middleware to handle file uploads to B2
 * @param {string} fieldName - Name of the file field in the form
 */
const handleUpload = (fieldName = 'file') => {
  return async (req, res, next) => {
    // Use multer to handle the initial file upload to local storage
    upload.single(fieldName)(req, res, async function (err) {
      if (err) {
        console.error('Multer error:', err.message);
        return res.status(400).json({ success: false, error: `Lỗi upload: ${err.message}` });
      }
      
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Không có file nào được upload' });
      }
      
      try {
        const filePath = req.file.path;
        
        // Check if file exists before attempting to upload
        if (!await fsExists(filePath)) {
          return res.status(400).json({ success: false, error: `File không tồn tại sau khi upload: ${filePath}` });
        }
        
        // Get original filename from our stored request info if available
        let originalName;
        if (req.fileInfo && req.fileInfo[fieldName]) {
          originalName = req.fileInfo[fieldName].originalName;
        } else {
          // Fallback to converting directly from the request file
          originalName = decodeFilename(req.file.originalname);
        }
        
        // Generate a unique name for the file on B2 with better preservation of original name
        // Include timestamp to ensure uniqueness while preserving the original filename
        const timestamp = Date.now();
        const sanitizedName = sanitizeFilename(originalName);
        const uniqueName = `${timestamp}-${sanitizedName}`;
        
        console.log(`Uploading file to B2: ${originalName} as ${uniqueName}`);
        
        // Check B2 environment variables before proceeding
        if (!process.env.B2_ACCESS_KEY_ID || !process.env.B2_SECRET_ACCESS_KEY || 
            !process.env.B2_BUCKET_ID || !process.env.B2_BUCKET_NAME) {
          console.error('Missing required B2 environment variables');
          return res.status(500).json({ 
            success: false, 
            error: 'Thiếu thông tin cấu hình Backblaze B2. Vui lòng kiểm tra biến môi trường.',
            missingConfig: true
          });
        }
        
        // Make sure B2Service is properly authenticated before uploading
        try {
          await b2Service.ensureAuthorized();
        } catch (authError) {
          console.error('Failed to authenticate with B2:', authError.message);
          return res.status(500).json({ 
            success: false, 
            error: `Không thể xác thực với Backblaze B2: ${authError.message}`,
            authError: true
          });
        }
        
        // Upload the file to B2 with proper error handling
        let uploadResult;
        try {
          console.log('Starting file upload to B2...');
          uploadResult = await b2Service.uploadFile(filePath, uniqueName);
          console.log('Upload response received');
        } catch (uploadError) {
          console.error('B2 upload threw exception:', uploadError.message);
          
          // Cleanup temp file
          try {
            if (await fsExists(filePath)) {
              await fsUnlink(filePath);
              console.log(`Cleaned up temp file after failed upload: ${filePath}`);
            }
          } catch (unlinkErr) {
            console.error(`Could not delete temp file ${filePath}:`, unlinkErr.message);
          }
          
          // Check for network related errors that might explain the 502 Bad Gateway
          const errorMessage = uploadError.message.toLowerCase();
          if (errorMessage.includes('timeout') || errorMessage.includes('socket hang up') || 
              errorMessage.includes('network') || errorMessage.includes('econnrefused')) {
            return res.status(504).json({
              success: false,
              error: `Lỗi mạng khi upload lên B2: ${uploadError.message}`,
              networkError: true
            });
          }
          
          return res.status(500).json({ 
            success: false, 
            error: `Lỗi khi upload lên B2: ${uploadError.message}` 
          });
        }
        
        if (!uploadResult || !uploadResult.success) {
          // Log the error details for debugging
          console.error('B2 upload failed:', uploadResult ? uploadResult.error : 'No result returned');
          
          // Try to clean up the temp file
          try {
            if (await fsExists(filePath)) {
              await fsUnlink(filePath);
              console.log(`Cleaned up temp file after failed upload: ${filePath}`);
            }
          } catch (unlinkErr) {
            console.error(`Could not delete temp file ${filePath}:`, unlinkErr.message);
          }
          
          return res.status(500).json({ 
            success: false, 
            error: `Lỗi khi upload lên B2: ${uploadResult ? uploadResult.error : 'Lỗi không xác định'}` 
          });
        }
        
        // Store B2 file information in the request for later use
        req.b2File = {
          originalname: originalName,
          size: req.file.size,
          mimetype: req.file.mimetype,
          filename: req.file.filename,
          objectName: uniqueName,
          url: uploadResult.url,
          fileId: uploadResult.fileId,
        };
        
        console.log(`File uploaded successfully to B2: ${uniqueName}`);
        
        // Try to clean up the temporary file only after confirming successful upload
        try {
          if (await fsExists(filePath)) {
            await fsUnlink(filePath);
            console.log(`Đã xóa file tạm ${filePath} sau khi upload thành công`);
          } else {
            console.warn(`File tạm ${filePath} không tồn tại khi cố gắng xóa`);
          }
        } catch (unlinkErr) {
          // Log the error but continue processing
          console.warn(`Không thể xóa file tạm ${filePath}:`, unlinkErr.message);
        }
        
        // Continue to next middleware
        next();
      } catch (error) {
        console.error('File handling error:', error.message);
        // Try to clean up the temporary file if it exists
        if (req.file && req.file.path) {
          try {
            if (await fsExists(req.file.path)) {
              await fsUnlink(req.file.path);
            }
          } catch (unlinkErr) {
            console.error(`Could not delete temp file ${req.file.path}:`, unlinkErr.message);
          }
        }
        return res.status(500).json({ 
          success: false, 
          error: `Lỗi xử lý file: ${error.message}` 
        });
      }
    });
  };
};

/**
 * Generate a presigned download URL for a file stored in B2
 * @param {string} objectName - The name/key of the file in B2
 * @returns {Promise<Object>} Object containing success status and URL
 */
const getPresignedDownloadUrl = async (objectName) => {
  try {
    // Ensure B2 Service is authorized
    await b2Service.ensureAuthorized();
    
    // Get download URL from B2 Service
    const downloadUrl = await b2Service.getDownloadUrl(objectName);
    
    return {
      success: true,
      url: downloadUrl
    };
  } catch (error) {
    console.error('Error generating presigned download URL:', error.message);
    return {
      success: false,
      error: `Unable to generate download URL: ${error.message}`
    };
  }
};

// Export functions and configured multer instance
module.exports = {
  storage,
  upload,
  handleUpload,
  b2Service,
  sanitizeFilename,
  decodeFilename,
  getPresignedDownloadUrl  // Add this export
};