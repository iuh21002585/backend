const Minio = require('minio');
const dotenv = require('dotenv');

dotenv.config();

// Khởi tạo client MinIO
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

// Tên bucket mặc định
const DEFAULT_BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'theses';

// Hàm kiểm tra xem bucket đã tồn tại hay chưa, nếu chưa thì tạo mới
const initializeBucket = async () => {
  try {
    const bucketExists = await minioClient.bucketExists(DEFAULT_BUCKET_NAME);
    if (!bucketExists) {
      await minioClient.makeBucket(DEFAULT_BUCKET_NAME, process.env.MINIO_REGION || 'us-east-1');
      console.log(`Bucket ${DEFAULT_BUCKET_NAME} được tạo thành công`);
    }
    console.log(`Kết nối thành công đến MinIO - Bucket: ${DEFAULT_BUCKET_NAME}`);
  } catch (error) {
    console.error('Không thể kết nối đến MinIO:', error);
  }
};

module.exports = {
  minioClient,
  DEFAULT_BUCKET_NAME,
  initializeBucket,
};
