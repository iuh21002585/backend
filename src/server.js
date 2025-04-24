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
const fs = require('fs');

// Tải biến môi trường
dotenv.config();

// Kết nối đến DB
connectDB();

// CORS configuration for MinIO
// Note: MinIO JavaScript client doesn't support setBucketCors directly
// Use MinIO Client (mc) command-line tool to set CORS policy
console.log('Note: To configure MinIO CORS, use the MinIO Client (mc) command-line tool:');
console.log('mc admin bucket cors set <alias>/<bucket> cors.json');

// Khởi tạo kết nối MinIO
initializeBucket().catch(err => {
  console.error('Lỗi khi khởi tạo MinIO:', err);
});

const app = express();

// Tăng giới hạn kích thước body cho requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cấu hình CORS với các tùy chọn nâng cao
app.use(cors({
  origin: ['https://iuh-plagcheck.onrender.com', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  maxAge: 3600
}));

// Thêm middleware để xử lý timeout cho các request lớn
app.use((req, res, next) => {
  // Tăng timeout cho các request upload file lên 5 phút
  if (req.url.includes('/upload') || req.url.includes('/theses')) {
    req.setTimeout(300000); // 5 phút
    res.setTimeout(300000); 
  }
  next();
});

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
