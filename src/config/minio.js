const Minio = require('minio');
const dotenv = require('dotenv');

dotenv.config();

// Determine MinIO endpoint based on environment
const determineMinIOConfig = () => {
  // Lấy tất cả thông tin cấu hình từ biến môi trường
  return {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'buiduchai',
    secretKey: process.env.MINIO_SECRET_KEY || 'Buiduchai1@',
    bucketName: process.env.MINIO_BUCKET_NAME || 'theses',
    region: process.env.MINIO_REGION || 'us-east-1'
  };
};

// Get MinIO configuration
const minioConfig = determineMinIOConfig();

// Khởi tạo client MinIO
const minioClient = new Minio.Client({
  endPoint: minioConfig.endPoint,
  port: minioConfig.port,
  useSSL: minioConfig.useSSL,
  accessKey: minioConfig.accessKey,
  secretKey: minioConfig.secretKey,
});

// Tên bucket mặc định
const DEFAULT_BUCKET_NAME = minioConfig.bucketName;

// Hàm kiểm tra xem bucket đã tồn tại hay chưa, nếu chưa thì tạo mới
const initializeBucket = async () => {
  try {
    console.log(`Connecting to MinIO at ${minioConfig.endPoint}:${minioConfig.port} (SSL: ${minioConfig.useSSL})`);
    
    const bucketExists = await minioClient.bucketExists(DEFAULT_BUCKET_NAME);
    if (!bucketExists) {
      await minioClient.makeBucket(DEFAULT_BUCKET_NAME, minioConfig.region);
      console.log(`Bucket ${DEFAULT_BUCKET_NAME} được tạo thành công`);
      
      // Set bucket policy to allow public read access
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
      
      // Apply the public policy to the bucket
      await minioClient.setBucketPolicy(DEFAULT_BUCKET_NAME, JSON.stringify(publicPolicy));
      console.log(`Public access policy set for bucket ${DEFAULT_BUCKET_NAME}`);
    }
    console.log(`Kết nối thành công đến MinIO - Bucket: ${DEFAULT_BUCKET_NAME}`);
  } catch (error) {
    console.error('Không thể kết nối đến MinIO:', error);
  }
};

// Export các biến và hàm để sử dụng trong các file khác
module.exports = {
  minioClient,
  DEFAULT_BUCKET_NAME,
  initializeBucket,
  minioConfig
};
