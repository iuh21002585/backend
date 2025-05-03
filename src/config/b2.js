const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Đảm bảo dotenv được load
dotenv.config();

// Kiểm tra file .env
const checkEnvFile = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('CẢNH BÁO: File .env không tồn tại. Vui lòng tạo file .env từ .env.example');
  }
};

// Gọi hàm kiểm tra khi module được import
checkEnvFile();

// Xác định cấu hình Backblaze B2 dựa trên biến môi trường
const determineB2Config = () => {
  // Kiểm tra tất cả các biến môi trường bắt buộc
  const requiredEnvVars = [
    'B2_ACCESS_KEY_ID', 
    'B2_SECRET_ACCESS_KEY', 
    'B2_BUCKET_ID', 
    'B2_BUCKET_NAME'
  ];
  
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error(`LỖI: Thiếu các biến môi trường bắt buộc cho Backblaze B2: ${missingEnvVars.join(', ')}`);
    console.error('Vui lòng kiểm tra file .env và đảm bảo đã cung cấp đầy đủ các biến môi trường.');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1); // Dừng ứng dụng trong môi trường production nếu thiếu biến môi trường
    }
  }

  // Trả về cấu hình phù hợp với B2Service mới
  return {
    applicationKeyId: process.env.B2_ACCESS_KEY_ID,
    applicationKey: process.env.B2_SECRET_ACCESS_KEY,
    bucketId: process.env.B2_BUCKET_ID,
    bucketName: process.env.B2_BUCKET_NAME
  };
};

// Lấy cấu hình B2
const b2Config = determineB2Config();

// Kiểm tra cấu hình B2
const validateB2Config = () => {
  const { applicationKeyId, applicationKey, bucketId, bucketName } = b2Config;
  
  if (!applicationKeyId || !applicationKey) {
    console.error('LỖI: Thiếu thông tin xác thực Backblaze B2. Vui lòng kiểm tra file .env');
    return false;
  }

  if (!bucketId) {
    console.error('LỖI: Chưa cấu hình ID bucket cho Backblaze B2. Vui lòng thiết lập B2_BUCKET_ID trong file .env');
    return false;
  }

  if (!bucketName) {
    console.error('LỖI: Chưa cấu hình tên bucket cho Backblaze B2. Vui lòng thiết lập B2_BUCKET_NAME trong file .env');
    return false;
  }

  return true;
};

// Export cấu hình cho B2Service
module.exports = {
  b2Config,
  validateB2Config
};