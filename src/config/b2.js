const AWS = require('aws-sdk');
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
  const requiredEnvVars = ['B2_ACCESS_KEY_ID', 'B2_SECRET_ACCESS_KEY', 'B2_ENDPOINT', 'B2_BUCKET_NAME', 'B2_REGION'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error(`LỖI: Thiếu các biến môi trường bắt buộc cho Backblaze B2: ${missingEnvVars.join(', ')}`);
    console.error('Vui lòng kiểm tra file .env và đảm bảo đã cung cấp đầy đủ các biến môi trường.');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1); // Dừng ứng dụng trong môi trường production nếu thiếu biến môi trường
    }
  }

  // Không cung cấp giá trị mặc định để đảm bảo người dùng phải cấu hình trong .env
  return {
    endpoint: process.env.B2_ENDPOINT,
    accessKeyId: process.env.B2_ACCESS_KEY_ID,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY,
    bucketName: process.env.B2_BUCKET_NAME,
    region: (process.env.B2_REGION || '').replace(/^(us-west-|eu-|ap-)/i, '') // Loại bỏ tiền tố nếu có
  };
};

// Lấy cấu hình B2
const b2Config = determineB2Config();

// Khởi tạo client AWS S3 chỉ khi đã có đầy đủ thông tin cấu hình
const createS3Client = () => {
  if (!b2Config.endpoint || !b2Config.accessKeyId || !b2Config.secretAccessKey || !b2Config.region) {
    return null;
  }

  return new AWS.S3({
    endpoint: new AWS.Endpoint(b2Config.endpoint),
    accessKeyId: b2Config.accessKeyId,
    secretAccessKey: b2Config.secretAccessKey,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    region: b2Config.region
  });
};

// Khởi tạo S3 client
const s3Client = createS3Client();

// Tên bucket
const DEFAULT_BUCKET_NAME = b2Config.bucketName;

// Hàm kiểm tra và tạo bucket nếu chưa tồn tại
const initializeBucket = async () => {
  // Kiểm tra xem client đã được khởi tạo thành công chưa
  if (!s3Client) {
    console.error('LỖI: Không thể khởi tạo S3 client với Backblaze B2. Vui lòng kiểm tra cấu hình trong file .env');
    throw new Error('Thiếu thông tin cấu hình Backblaze B2');
  }

  if (!b2Config.accessKeyId || !b2Config.secretAccessKey) {
    console.error('LỖI: Thiếu thông tin xác thực Backblaze B2. Vui lòng kiểm tra file .env');
    throw new Error('Thiếu thông tin xác thực Backblaze B2');
  }

  if (!DEFAULT_BUCKET_NAME) {
    console.error('LỖI: Chưa cấu hình tên bucket cho Backblaze B2. Vui lòng thiết lập B2_BUCKET_NAME trong file .env');
    throw new Error('Thiếu tên bucket Backblaze B2');
  }

  try {
    console.log(`Kết nối tới Backblaze B2 tại ${b2Config.endpoint}`);
    
    // Kiểm tra xem bucket đã tồn tại chưa
    try {
      await s3Client.headBucket({ Bucket: DEFAULT_BUCKET_NAME }).promise();
      console.log(`Bucket ${DEFAULT_BUCKET_NAME} đã tồn tại`);
    } catch (error) {
      if (error.statusCode === 404) {
        // Bucket không tồn tại, tạo mới
        console.log(`Bucket ${DEFAULT_BUCKET_NAME} chưa tồn tại. Đang tạo mới...`);
        try {
          // Thử tạo bucket mới
          await s3Client.createBucket({ 
            Bucket: DEFAULT_BUCKET_NAME
          }).promise();
          console.log(`Đã tạo bucket ${DEFAULT_BUCKET_NAME} thành công`);
          
          // Cấu hình CORS cho bucket
          const corsConfiguration = {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3000
              }
            ]
          };
          
          await s3Client.putBucketCors({
            Bucket: DEFAULT_BUCKET_NAME,
            CORSConfiguration: corsConfiguration
          }).promise();
          console.log('Đã cấu hình CORS cho bucket thành công');
        } catch (createError) {
          console.error('Lỗi khi tạo bucket mới:', createError);
          throw createError;
        }
      } else if (error.statusCode === 403) {
        console.error('Lỗi khi kiểm tra bucket: Forbidden. Xin kiểm tra lại API key và quyền truy cập trong file .env');
        throw error;
      } else {
        console.error('Lỗi khi kiểm tra bucket:', error);
        throw error;
      }
    }
    
    console.log(`Kết nối thành công đến Backblaze B2 - Bucket: ${DEFAULT_BUCKET_NAME}`);
  } catch (error) {
    console.error('Không thể kết nối đến Backblaze B2:', error);
    throw error;
  }
};

// Export các biến và hàm để sử dụng trong các file khác
module.exports = {
  s3Client,
  DEFAULT_BUCKET_NAME,
  initializeBucket,
  b2Config
};