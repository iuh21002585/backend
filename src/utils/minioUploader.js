const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { minioClient, DEFAULT_BUCKET_NAME, minioConfig } = require('../config/minio');

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
    'application/msword',                                          // DOC
    'application/vnd.oasis.opendocument.text',                     // ODT
    'text/plain',                                                  // TXT
    'application/rtf',                                             // RTF
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.ms-powerpoint'                                // PPT
  ];

  if (supportedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  } else {
    cb('Định dạng file không được hỗ trợ. Vui lòng tải lên file PDF, DOCX, DOC, ODT, TXT, RTF, PPTX hoặc PPT!');
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // Giới hạn 100MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

// Hàm upload lên MinIO và xóa file tạm
const uploadToMinIO = async (filePath, fileName, mimeType) => {
  try {
    console.log(`Uploading file to MinIO at ${minioConfig.endPoint}`);
    
    // Tạo tên file duy nhất trên MinIO
    const objectName = `theses/${Date.now()}-${fileName}`;
    
    // Upload file lên MinIO
    await minioClient.fPutObject(
      DEFAULT_BUCKET_NAME, 
      objectName, 
      filePath, 
      { 'Content-Type': mimeType }
    );
    
    console.log(`File uploaded successfully to ${objectName}`);
    
    // Xóa file tạm sau khi upload
    fs.unlinkSync(filePath);
    
    // Generate a URL for accessing the file
    let fileUrl;
    if (process.env.NODE_ENV === 'production') {
      // In production, generate a presigned URL
      fileUrl = await minioClient.presignedGetObject(
        DEFAULT_BUCKET_NAME,
        objectName,
        24 * 60 * 60 // 24 hours expiry
      );
    } else {
      // In development, use local API route
      fileUrl = `/api/theses/file/${objectName}`;
    }
    
    return {
      success: true,
      objectName,
      url: fileUrl
    };
  } catch (error) {
    // Xử lý lỗi và xóa file tạm nếu upload thất bại
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('Lỗi khi upload lên MinIO:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Hàm upload kết quả kiểm tra đạo văn lên MinIO
const uploadCheckedFileToMinIO = async (fileBuffer, fileName, type, mimeType = 'application/pdf') => {
  try {
    // Xác định thư mục dựa vào loại kiểm tra
    const folder = type === 'ai' ? 'checkedAI' : 'checked';
    
    // Tạo tên file duy nhất trên MinIO
    const objectName = `${folder}/${Date.now()}-${fileName}`;
    
    // Tạo file tạm thời từ buffer
    const tempFilePath = path.join('uploads/temp', `report-${Date.now()}.pdf`);
    
    // Đảm bảo thư mục tồn tại
    if (!fs.existsSync('uploads/temp')) {
      fs.mkdirSync('uploads/temp', { recursive: true });
    }
    
    // Ghi buffer vào file tạm
    fs.writeFileSync(tempFilePath, fileBuffer);
    
    // Kiểm tra xem bucket có tồn tại không và tạo nếu chưa
    const bucketExists = await minioClient.bucketExists(DEFAULT_BUCKET_NAME);
    if (!bucketExists) {
      console.log(`Bucket ${DEFAULT_BUCKET_NAME} chưa tồn tại. Đang tạo mới...`);
      await minioClient.makeBucket(DEFAULT_BUCKET_NAME, process.env.MINIO_REGION || 'us-east-1');
      console.log(`Bucket ${DEFAULT_BUCKET_NAME} được tạo thành công`);
    }
    
    // Upload file lên MinIO
    await minioClient.fPutObject(
      DEFAULT_BUCKET_NAME,
      objectName,
      tempFilePath,
      { 'Content-Type': mimeType }
    );
    
    // Xóa file tạm sau khi upload
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    console.log(`Đã upload báo cáo đạo văn thành công: ${objectName}`);
    
    return {
      success: true,
      objectName,
      // Fix: Return the object name directly without path prefix for proper storage in the database
      url: objectName 
    };
  } catch (error) {
    // Xử lý lỗi và xóa file tạm nếu tồn tại
    const tempFilePath = path.join('uploads/temp', `report-${Date.now()}.pdf`);
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (unlinkError) {
        console.error('Lỗi khi xóa file tạm:', unlinkError);
      }
    }
    
    console.error('Lỗi khi upload báo cáo đạo văn lên MinIO:', error);
    
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

// Hàm truy xuất file từ MinIO
const getFileFromMinIO = async (objectName) => {
  try {
    // Tạo URL tạm thời để truy cập file (có thể đặt thời gian hết hạn)
    const presignedUrl = await minioClient.presignedGetObject(
      DEFAULT_BUCKET_NAME,
      objectName,
      24 * 60 * 60 // URL có hiệu lực trong 24 giờ
    );
    
    return {
      success: true,
      url: presignedUrl
    };
  } catch (error) {
    console.error('Lỗi khi lấy file từ MinIO:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Hàm tải file từ MinIO
const downloadFromMinIO = async (objectName) => {
  try {
    // Tạo stream để tải file từ MinIO
    const stream = await minioClient.getObject(
      DEFAULT_BUCKET_NAME,
      objectName
    );
    
    return {
      success: true,
      stream
    };
  } catch (error) {
    console.error('Lỗi khi tải file từ MinIO:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Hàm xóa file từ MinIO
const deleteFileFromMinIO = async (objectName) => {
  try {
    await minioClient.removeObject(DEFAULT_BUCKET_NAME, objectName);
    return {
      success: true
    };
  } catch (error) {
    console.error('Lỗi khi xóa file từ MinIO:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Middleware để xử lý upload và chuyển file lên MinIO
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
        // Upload file lên MinIO
        const result = await uploadToMinIO(
          req.file.path,
          req.file.originalname,
          req.file.mimetype
        );
        
        if (!result.success) {
          return res.status(500).json({ message: 'Lỗi khi lưu trữ file: ' + result.error });
        }
        
        // Thêm thông tin file đã upload vào req để controller sử dụng
        req.minioFile = {
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          bucket: DEFAULT_BUCKET_NAME,
          objectName: result.objectName,
          url: result.url
        };
        
        // Xóa file tạm sau khi đã upload lên MinIO
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
  getFileFromMinIO,
  deleteFileFromMinIO,
  uploadCheckedFileToMinIO,
  downloadFromMinIO
};
