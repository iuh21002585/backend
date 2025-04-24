const { minioClient, DEFAULT_BUCKET_NAME, initializeBucket } = require('./config/minio');

// Kiểm tra bucket 
const checkBucket = async () => {
  try {
    console.log('Cấu hình MinIO Client:', {
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: '***' // Ẩn mật khẩu
    });

    // Kiểm tra bucket tồn tại hay không
    const exists = await minioClient.bucketExists(DEFAULT_BUCKET_NAME);
    console.log(`Bucket '${DEFAULT_BUCKET_NAME}' tồn tại: ${exists}`);

    if (!exists) {
      console.log('Đang tạo bucket mới...');
      await minioClient.makeBucket(DEFAULT_BUCKET_NAME, process.env.MINIO_REGION || 'us-east-1');
      console.log(`Đã tạo bucket '${DEFAULT_BUCKET_NAME}' thành công!`);
    }

    // Liệt kê tất cả bucket
    console.log('\nDanh sách tất cả bucket:');
    const buckets = await minioClient.listBuckets();
    console.log(buckets);

    // Thử tạo file nhỏ để kiểm tra
    const testObjectName = `test-${Date.now()}.txt`;
    const testContent = Buffer.from('Đây là file kiểm tra MinIO connection', 'utf8');
    
    console.log(`\nĐang upload file kiểm tra '${testObjectName}'...`);
    await minioClient.putObject(DEFAULT_BUCKET_NAME, testObjectName, testContent);
    console.log('Upload file kiểm tra thành công!');
    
    // Tạo URL cho file
    const url = await minioClient.presignedGetObject(DEFAULT_BUCKET_NAME, testObjectName, 60*60);
    console.log(`Đường dẫn tạm thời đến file: ${url}`);

  } catch (error) {
    console.error('Lỗi khi kiểm tra MinIO:', error);
  }
};

// Khởi tạo bucket và kiểm tra kết nối
const runTest = async () => {
  try {
    // Khởi tạo bucket 
    await initializeBucket();
    
    // Kiểm tra thêm các chức năng khác
    await checkBucket();
    
    console.log('\nKiểm tra kết nối MinIO thành công!');
  } catch (error) {
    console.error('Lỗi khi kiểm tra MinIO:', error);
  }
};

// Chạy kiểm tra
runTest();
