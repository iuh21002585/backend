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

// Tải biến môi trường
dotenv.config();

// Kết nối đến DB
connectDB();

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
