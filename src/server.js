const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const connectDB = require('./config/db');
const { initializeBucket, b2Config } = require('./config/b2');
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

const app = express();

// Set NODE_ENV if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

// Khởi tạo kết nối Backblaze B2
initializeBucket()
  .then(() => {
    console.log(`Backblaze B2 connected successfully in ${process.env.NODE_ENV} mode using endpoint: ${b2Config.endpoint}`);
  })
  .catch(err => {
    console.error('Error initializing Backblaze B2:', err);
  });

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https://s3.us-west-002.backblazeb2.com", "*.backblazeb2.com"],
        "connect-src": ["'self'", "https://s3.us-west-002.backblazeb2.com", "*.backblazeb2.com"]
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
} else {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
}

// Tăng giới hạn kích thước body cho requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Improve CORS configuration to handle preflight and large uploads
app.use(cors({
  origin: ['https://iuh-plagcheck.onrender.com', 'http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Length', 'Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// Handle timeouts for file uploads
app.use((req, res, next) => {
  // Increase timeout for upload routes to 10 minutes
  if (req.url.includes('/upload') || req.url.includes('/theses')) {
    req.setTimeout(600000); // 10 minutes
    res.setTimeout(600000);
  }
  next();
});

// Thư mục uploads có thể truy cập công khai
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Log requests in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// Các routes
app.use('/api/users', userRoutes);
app.use('/api/theses', thesisRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/config', configRoutes);

// Route kiểm tra API
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'API hoạt động bình thường',
    environment: process.env.NODE_ENV,
    b2Config: {
      endpoint: b2Config.endpoint,
      bucketName: b2Config.bucketName,
      region: b2Config.region
    }
  });
});

// Middleware xử lý lỗi
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT} trong môi trường ${process.env.NODE_ENV}`);
});
