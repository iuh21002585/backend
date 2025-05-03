const Minio = require('minio');
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

// Xác định cấu hình MinIO dựa trên biến môi trường
const determineMinIOConfig = () => {
  // Kiểm tra các biến môi trường bắt buộc
  const requiredEnvVars = ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET_NAME'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error(`LỖI: Thiếu các biến môi trường bắt buộc cho MinIO: ${missingEnvVars.join(', ')}`);
    console.error('Vui lòng kiểm tra file .env và đảm bảo đã cung cấp đầy đủ các biến môi trường.');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1); // Dừng ứng dụng trong môi trường production nếu thiếu biến môi trường
    }
  }

  // Sử dụng giá trị từ biến môi trường, không cung cấp giá trị mặc định
  return {
    endPoint: process.env.MINIO_ENDPOINT,
    port: process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucketName: process.env.MINIO_BUCKET_NAME,
    region: process.env.MINIO_REGION || 'us-east-1'
  };
};

// Lấy cấu hình MinIO
const minioConfig = determineMinIOConfig();

// Khởi tạo client MinIO chỉ khi đã có đầy đủ thông tin cấu hình
const createMinioClient = () => {
  if (!minioConfig.endPoint || !minioConfig.accessKey || !minioConfig.secretKey) {
    return null;
  }

  return new Minio.Client({
    endPoint: minioConfig.endPoint,
    port: minioConfig.port,
    useSSL: minioConfig.useSSL,
    accessKey: minioConfig.accessKey,
    secretKey: minioConfig.secretKey,
  });
};

// Khởi tạo MinIO client
const minioClient = createMinioClient();

// Tên bucket
const DEFAULT_BUCKET_NAME = minioConfig.bucketName;

// Hàm kiểm tra và tạo bucket nếu chưa tồn tại
const initializeBucket = async () => {
  // Kiểm tra xem client đã được khởi tạo thành công chưa
  if (!minioClient) {
    console.error('LỖI: Không thể khởi tạo MinIO client. Vui lòng kiểm tra cấu hình trong file .env');
    throw new Error('Thiếu thông tin cấu hình MinIO');
  }

  if (!DEFAULT_BUCKET_NAME) {
    console.error('LỖI: Chưa cấu hình tên bucket cho MinIO. Vui lòng thiết lập MINIO_BUCKET_NAME trong file .env');
    throw new Error('Thiếu tên bucket MinIO');
  }

  try {
    console.log(`Kết nối tới MinIO tại ${minioConfig.endPoint}:${minioConfig.port} (SSL: ${minioConfig.useSSL})`);
    
    const bucketExists = await minioClient.bucketExists(DEFAULT_BUCKET_NAME);
    if (!bucketExists) {
      await minioClient.makeBucket(DEFAULT_BUCKET_NAME, minioConfig.region);
      console.log(`Bucket ${DEFAULT_BUCKET_NAME} được tạo thành công`);
      
      // Thiết lập chính sách bucket để cho phép truy cập đọc công khai
      const publicPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${DEFAULT_BUCKET_NAME}/*`]
          }
        ]
      };
      
      // Áp dụng chính sách công khai cho bucket
      await minioClient.setBucketPolicy(DEFAULT_BUCKET_NAME, JSON.stringify(publicPolicy));
      console.log(`Đã thiết lập chính sách truy cập công khai cho bucket ${DEFAULT_BUCKET_NAME}`);
    }
    console.log(`Kết nối thành công đến MinIO - Bucket: ${DEFAULT_BUCKET_NAME}`);
  } catch (error) {
    console.error('Không thể kết nối đến MinIO:', error);
    throw error;
  }
};

// Export các biến và hàm để sử dụng trong các file khác
module.exports = {
  minioClient,
  DEFAULT_BUCKET_NAME,
  initializeBucket,
  minioConfig
};
