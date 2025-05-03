const multer = require('multer');
const path = require('path');
const fs = require('fs');
const B2Service = require('../services/b2Service');
const { b2Config } = require('../config/b2');

// Khởi tạo B2Service với cấu hình từ config
const b2Service = new B2Service(b2Config);

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
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

// Kiểm tra loại file
const checkFileType = (file, cb) => {
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
    cb(new Error('Chỉ chấp nhận các file PDF, DOCX, DOC, ODT, TXT, RTF, PPTX và PPT'));
  }
};

// Cấu hình multer
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 50MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

// Hàm upload lên Backblaze B2 và xóa file tạm
const uploadToB2 = async (filePath, fileName, mimeType) => {
  try {
    console.log(`Đang tải file lên Backblaze B2`);
    
    // Tạo tên file duy nhất trên Backblaze B2
    const objectName = `theses/${Date.now()}-${fileName}`;
    
    // Upload file lên Backblaze B2 sử dụng B2Service mới
    const result = await b2Service.uploadFile(filePath, objectName);
    
    if (!result.success) {
      throw new Error(`Lỗi khi tải file lên B2: ${result.error}`);
    }
    
    console.log(`Đã tải file lên B2 thành công: ${objectName}`);
    
    // Xóa file tạm sau khi upload
    fs.unlinkSync(filePath);
    
    return {
      success: true,
      objectName,
      url: result.url
    };
  } catch (error) {
    // Xử lý lỗi và xóa file tạm nếu upload thất bại
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('Lỗi khi upload lên Backblaze B2:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Hàm upload kết quả kiểm tra đạo văn lên Backblaze B2
const uploadCheckedFileToB2 = async (fileBuffer, fileName, type, mimeType = 'application/pdf') => {
  try {
    // Xác định thư mục dựa vào loại kiểm tra
    const folder = type === 'ai' ? 'checkedAI' : 'checked';
    
    // Tạo tên file duy nhất trên Backblaze B2
    const objectName = `${folder}/${Date.now()}-${fileName}`;
    
    // Upload buffer lên B2 sử dụng B2Service mới
    const result = await b2Service.uploadBuffer(fileBuffer, objectName, mimeType);
    
    if (!result.success) {
      throw new Error(`Lỗi khi tải buffer lên B2: ${result.error}`);
    }
    
    console.log(`Đã upload báo cáo đạo văn thành công: ${objectName}`);
    
    return {
      success: true,
      objectName,
      url: objectName
    };
  } catch (error) {
    console.error('Lỗi khi upload báo cáo đạo văn lên Backblaze B2:', error);
    
    // Trả về lỗi có nhiều thông tin hơn
    return {
      success: false,
      error: error.message,
      errorType: error.name,
      reportType: type,
      fileName: fileName
    };
  }
};

// Hàm truy xuất file từ Backblaze B2
const getFileFromB2 = async (objectName) => {
  try {
    // Lấy URL download từ B2Service
    const urlResult = await b2Service.getFileDownloadUrl(objectName);
    
    if (!urlResult.success) {
      throw new Error(`Không thể lấy URL download: ${urlResult.error}`);
    }
    
    return {
      success: true,
      url: urlResult.url
    };
  } catch (error) {
    console.error('Lỗi khi lấy file từ Backblaze B2:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Hàm tải file từ Backblaze B2
const downloadFromB2 = async (objectName) => {
  try {
    // Tải file từ B2 sử dụng B2Service
    const result = await b2Service.downloadFile(objectName);
    
    if (!result.success) {
      throw new Error(`Không thể tải file từ B2: ${result.error}`);
    }
    
    return {
      success: true,
      data: result.data,
      contentType: result.contentType
    };
  } catch (error) {
    console.error('Lỗi khi tải file từ Backblaze B2:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Hàm xóa file từ Backblaze B2
const deleteFileFromB2 = async (objectName) => {
  try {
    // Xóa file từ B2 sử dụng B2Service
    const result = await b2Service.deleteFile(objectName);
    
    if (!result.success) {
      throw new Error(`Không thể xóa file từ B2: ${result.error}`);
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Lỗi khi xóa file từ Backblaze B2:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Middleware để xử lý upload và chuyển file lên Backblaze B2
const handleUpload = (fieldName = 'file') => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, async function (err) {
      if (err) {
        return res.status(400).json({ message: err.message || 'Lỗi khi tải file lên' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'Vui lòng tải lên file PDF, DOCX, DOC, ODT, TXT, RTF, PPTX hoặc PPT' });
      }
      
      try {
        // Upload file lên Backblaze B2
        const result = await uploadToB2(
          req.file.path,
          req.file.originalname,
          req.file.mimetype
        );
        
        if (!result.success) {
          return res.status(500).json({ message: 'Lỗi khi lưu trữ file: ' + result.error });
        }
        
        // Thêm thông tin file đã upload vào req để controller sử dụng
        req.b2File = {
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          bucket: b2Config.bucketName,
          objectName: result.objectName,
          url: result.url
        };
        
        // Xóa file tạm sau khi đã upload lên Backblaze B2
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Lỗi khi xóa file tạm:', unlinkErr);
          }
        });
        
        next();
      } catch (error) {
        console.error('Lỗi trong middleware handleUpload:', error);
        return res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
      }
    });
  };
};

module.exports = {
  handleUpload,
  getFileFromB2,
  deleteFileFromB2,
  uploadCheckedFileToB2,
  downloadFromB2
};