const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const passport = require('passport');
const http = require('http');
const connectDB = require('./config/db');
const { validateB2Config, b2Config } = require('./config/b2');
const { configurePassport } = require('./config/passport');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');
const { loggingMiddleware } = require('./middlewares/loggingMiddleware');
const userRoutes = require('./routes/userRoutes');
const thesisRoutes = require('./routes/thesisRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const activityRoutes = require('./routes/activityRoutes');
const configRoutes = require('./routes/configRoutes');
const queueRoutes = require('./routes/queueRoutes');

// Khởi tạo worker system
let workerSystem;
try {
  workerSystem = require('./workers');
  console.log('Worker system module loaded successfully');
} catch (error) {
  console.error('Could not load worker system:', error);
}

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
if (validateB2Config()) {
  console.log(`Backblaze B2 configuration validated successfully in ${process.env.NODE_ENV} mode`);
} else {
  console.error('Error validating Backblaze B2 configuration');
}

// Thiết lập Passport.js cho xác thực Google OAuth
configurePassport();
app.use(passport.initialize());

// Apply enhanced logging middleware early in the pipeline
app.use(loggingMiddleware);

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https://s3.us-west-002.backblazeb2.com", "*.backblazeb2.com", "*.googleusercontent.com", "*.google.com"],
        "connect-src": ["'self'", "https://s3.us-west-002.backblazeb2.com", "*.backblazeb2.com", "*.google.com", "accounts.google.com"],
        "script-src": ["'self'", "'unsafe-inline'", "*.google.com", "accounts.google.com"],
        "frame-src": ["'self'", "*.google.com", "accounts.google.com"]
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
  origin: function(origin, callback) {
    // Log all origins in development mode for debugging
    console.log('Request origin:', origin);
    
    // Ưu tiên sử dụng biến môi trường
    const frontendUrl = process.env.FRONTEND_URL || 'https://iuh-plagcheck.onrender.com';
    const backendUrl = process.env.BACKEND_URL || 'https://backend-6c5g.onrender.com';
    
    // Danh sách các domain được phép (whitelist)
    const whitelist = [
      frontendUrl,
      backendUrl,
      'https://iuh-plagcheck.vercel.app',
      'http://localhost:3000', 
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:3000',
    ];
    
    // Always allow requests with no origin (like mobile apps, curl, or postman)
    if (!origin) {
      console.log('Request has no origin, allowing access');
      return callback(null, true);
    }
    
    // Allow whitelisted origins
    if (whitelist.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: allowing non-whitelisted origin:', origin);
      return callback(null, true);
    }
    
    // In production, log warning but still allow
    console.warn(`CORS warning: ${origin} not in whitelist but allowing in production`);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Length', 'Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// Add a special handler for OPTIONS requests with wildcard to ensure preflight works
app.options('*', cors());

// Additional CORS headers for all responses as a fallback
app.use((req, res, next) => {
  // Ensure these headers are always set
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Log all requests in development mode for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`${req.method} ${req.url}`);
  }
  
  next();
});

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

// Các routes
app.use('/api/users', userRoutes);
app.use('/api/theses', thesisRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/config', configRoutes);
app.use('/api/queues', queueRoutes);

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

// Root route handler
app.get('/', (req, res) => {
  res.json({
    name: 'IUH PLAGCHECK API',
    version: '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV,
    documentation: '/api/docs',
    healthCheck: '/api/health',
    endpoints: [
      { path: '/api/users', description: 'User management' },
      { path: '/api/theses', description: 'Thesis management and plagiarism checking' },
      { path: '/api/notifications', description: 'User notifications' },
      { path: '/api/activities', description: 'User activity logs' },
      { path: '/api/config', description: 'System configuration' }
    ],
    timestamp: new Date().toISOString()
  });
});

// Trong môi trường production, phục vụ static files từ frontend build
if (process.env.NODE_ENV === 'production') {
  // Đường dẫn tới thư mục build của frontend
  const frontendBuildPath = path.resolve(__dirname, '../../frontend/dist');
  console.log(`Serving frontend static files from: ${frontendBuildPath}`);
  
  // Phục vụ các static assets từ thư mục build
  app.use(express.static(frontendBuildPath));
  
  // Xử lý tất cả các client-side routes bằng cách trả về index.html
  app.get('*', (req, res) => {
    // Bỏ qua các requests tới API và uploads
    if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
      return next();
    }
    console.log(`Serving frontend for client-side route: ${req.url}`);
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// Middleware xử lý lỗi
app.use(notFound);
app.use(errorHandler);

// Tăng giá trị global agent settings cho tất cả HTTP requests
http.globalAgent.maxSockets = 100; // Tăng số lượng kết nối đồng thời
http.globalAgent.keepAlive = true;
http.globalAgent.keepAliveMsecs = 60000; // 60 seconds

// Tạo HTTP server với cấu hình timeout tối ưu
const server = http.createServer(app);

// Cấu hình timeouts (timeout là 120 giây = 120000ms)
server.keepAliveTimeout = 120000; // Tăng timeout cho keep-alive connections
server.headersTimeout = 121000; // Cần lớn hơn keepAliveTimeout
server.timeout = 300000; // 5 phút cho các requests đặc biệt

// Khắc phục lỗi "ECONNRESET" và "socket hang up"
server.on('clientError', (err, socket) => {
  console.error('Client connection error:', err);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// Xử lý lỗi server để tránh crash
server.on('error', (error) => {
  console.error('Server error:', error);
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Đảm bảo server bind vào tất cả các interfaces

server.listen(PORT, HOST, () => {
  console.log(`Server đang chạy tại http://${HOST}:${PORT} trong môi trường ${process.env.NODE_ENV}`);
  console.log(`- keepAliveTimeout: ${server.keepAliveTimeout}ms`);
  console.log(`- headersTimeout: ${server.headersTimeout}ms`);
  console.log(`- timeout: ${server.timeout}ms`);
  
  // Khởi động worker system nếu đã tải thành công
  if (workerSystem && typeof workerSystem.initWorkers === 'function') {
    try {
      workerSystem.initWorkers();
      console.log('Worker system initialized and running');
    } catch (error) {
      console.error('Failed to initialize worker system:', error);
    }
  } else {
    console.warn('Worker system not available or not properly configured');
  }
});

// Graceful shutdown để đảm bảo các jobs đang xử lý được hoàn thành
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server and workers');
  
  // Đóng HTTP server trước
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Sau đó đóng worker systems
  try {
    const { shutdownWorkers } = require('./workers');
    if (typeof shutdownWorkers === 'function') {
      await shutdownWorkers();
      console.log('Worker system gracefully shut down');
    }
  } catch (error) {
    console.error('Error during worker shutdown:', error);
  }
  
  // Đợi một lúc để hoàn thành các tiến trình đang chạy
  setTimeout(() => {
    console.log('Exiting process');
    process.exit(0);
  }, 3000);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server and workers');
  
  // Đóng HTTP server trước
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Sau đó đóng worker systems
  try {
    const { shutdownWorkers } = require('./workers');
    if (typeof shutdownWorkers === 'function') {
      await shutdownWorkers();
      console.log('Worker system gracefully shut down');
    }
  } catch (error) {
    console.error('Error during worker shutdown:', error);
  }
  
  // Đợi một lúc để hoàn thành các tiến trình đang chạy
  setTimeout(() => {
    console.log('Exiting process');
    process.exit(0);
  }, 3000);
});
