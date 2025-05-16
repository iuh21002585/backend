/**
 * Script chạy riêng worker process cho IUH_PLAGCHECK
 * File này có thể được sử dụng để chạy worker riêng biệt nếu cần thiết
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Cấu hình MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Hàm chạy worker
async function runWorker() {
  console.log('Khởi động worker system...');
  
  // Kết nối database
  await connectDB();
  
  try {
    // Khởi tạo worker system
    const { initWorkers } = require('./src/workers');
    
    // Bắt đầu các workers
    initWorkers();
    
    console.log('Worker system đã được khởi động thành công');
  } catch (error) {
    console.error('Lỗi khi khởi động worker system:', error);
    process.exit(1);
  }
}

// Xử lý tắt graceful
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  try {
    const { shutdownWorkers } = require('./src/workers');
    await shutdownWorkers();
  } catch (error) {
    console.error('Lỗi khi dừng worker:', error);
  }
  
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  try {
    const { shutdownWorkers } = require('./src/workers');
    await shutdownWorkers();
  } catch (error) {
    console.error('Lỗi khi dừng worker:', error);
  }
  
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

// Khởi động worker
runWorker();
