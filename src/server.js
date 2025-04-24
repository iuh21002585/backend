const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { initializeBucket } = require('./config/minio');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');
const userRoutes = require('./routes/userRoutes');
const thesisRoutes = require('./routes/thesisRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const activityRoutes = require('./routes/activityRoutes');
const configRoutes = require('./routes/configRoutes');
const Minio = require('minio');

// Tải biến môi trường
dotenv.config();

// Kết nối đến DB
connectDB();

const minioClient = new Minio.Client({
  endPoint: '127.0.0.1', // Hoặc IP hoặc domain của MinIO server
  port: 9000, // Port MinIO
  useSSL: false, // Chỉ sử dụng SSL nếu cấu hình MinIO hỗ trợ SSL
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

// Tạo CORS configuration cho MinIO
minioClient.setBucketCors('mybucket', [
  {
    AllowedOrigins: ['https://iuh-plagcheck.onrender.com'],
    AllowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    AllowedHeaders: ['*'],
    MaxAgeSeconds: 3000,
  }
], (err) => {
  if (err) {
    console.log('Lỗi khi cấu hình CORS MinIO:', err);
  } else {
    console.log('CORS cho MinIO đã được cấu hình thành công');
  }
});
// Khởi tạo kết nối MinIO
initializeBucket().catch(err => {
  console.error('Lỗi khi khởi tạo MinIO:', err);
});

const app = express();

// Middleware
// app.use(cors());
app.use(cors({
  origin: ['https://iuh-plagcheck.onrender.com'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Thư mục uploads có thể truy cập công khai
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Các routes
app.use('/api/users', userRoutes);
app.use('/api/theses', thesisRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/config', configRoutes);

// Route kiểm tra API
app.get('/api/health', (req, res) => {
  res.json({ message: 'API hoạt động bình thường' });
});

// Middleware xử lý lỗi
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});
