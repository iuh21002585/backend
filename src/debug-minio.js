const Minio = require('minio');
const dotenv = require('dotenv');

dotenv.config();

// Lấy thông tin kết nối từ biến môi trường
const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
const port = parseInt(process.env.MINIO_PORT || '9000');
const useSSL = process.env.MINIO_USE_SSL === 'true';
const accessKey = process.env.MINIO_ACCESS_KEY || '';
const secretKey = process.env.MINIO_SECRET_KEY || '';
const bucketName = process.env.MINIO_BUCKET_NAME || 'theses';

// Kiểm tra các biến cần thiết
if (!accessKey || !secretKey) {
  console.error('❌ Lỗi: MINIO_ACCESS_KEY hoặc MINIO_SECRET_KEY không được cấu hình trong file .env');
  console.error('Vui lòng cấu hình các biến môi trường này trong file .env của bạn.');
  process.exit(1);
}

console.log(`Kết nối đến MinIO với các thông số:`);
console.log(`- Endpoint: ${endPoint}`);
console.log(`- Port: ${port}`);
console.log(`- SSL: ${useSSL}`);
console.log(`- Access Key: ${accessKey}`);
console.log(`- Bucket: ${bucketName}`);

// Khởi tạo client MinIO
const minioClient = new Minio.Client({
  endPoint,
  port,
  useSSL,
  accessKey,
  secretKey
});

// Kiểm tra kết nối và bucket
async function checkConnection() {
  try {
    // Kiểm tra bucket có tồn tại không
    const exists = await minioClient.bucketExists(bucketName);
    if (exists) {
      console.log(`✅ Kết nối thành công! Bucket '${bucketName}' đã tồn tại.`);
      
      // Liệt kê tất cả đối tượng trong bucket
      console.log(`\nDanh sách các đối tượng trong bucket '${bucketName}':`);
      let objects = [];
      const objectsStream = minioClient.listObjects(bucketName, '', true);
      
      objectsStream.on('data', (obj) => {
        objects.push(obj);
        console.log(` - ${obj.name} (${obj.size} bytes)`);
      });
      
      objectsStream.on('end', () => {
        console.log(`\nTổng cộng: ${objects.length} đối tượng.`);
      });
      
      objectsStream.on('error', (err) => {
        console.error(`❌ Lỗi khi liệt kê đối tượng: ${err.message}`);
      });
    } else {
      console.log(`⚠️ Kết nối thành công, nhưng bucket '${bucketName}' chưa tồn tại.`);
      console.log(`Đang tạo bucket '${bucketName}'...`);
      
      await minioClient.makeBucket(bucketName, process.env.MINIO_REGION || 'us-east-1');
      console.log(`✅ Đã tạo bucket '${bucketName}' thành công!`);
    }
  } catch (error) {
    console.error(`❌ Lỗi kết nối đến MinIO: ${error.message}`);
    console.error(error);
  }
}

checkConnection();
