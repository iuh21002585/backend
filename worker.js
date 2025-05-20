/**
 * Script chạy riêng worker process cho IUH_PLAGCHECK
 * 
 * LƯU Ý: Tệp này chỉ còn được giữ lại để đảm bảo tương thích ngược.
 * Kể từ phiên bản cập nhật tháng 5/2025, hệ thống đã loại bỏ sự phụ thuộc vào Redis
 * và worker system riêng biệt. Thay vào đó, chức năng xử lý luận văn được tích hợp
 * trực tiếp vào API server thông qua thesisMonitorMiddleware.
 * 
 * Nếu bạn đang sử dụng worker.js, hãy xem xét chuyển sang sử dụng server.js với 
 * AUTO_PROCESS_ENABLED=true để có trải nghiệm tốt hơn.
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
  console.log('CẢNH BÁO: Worker system đã không còn cần thiết. Hãy sử dụng server.js với AUTO_PROCESS_ENABLED=true');
  
  // Kết nối database
  await connectDB();
  
  try {
    // Khởi tạo hệ thống xử lý luận văn
    console.log('Khởi động hệ thống xử lý luận văn thông qua thesisProcessor...');
    const thesisProcessor = require('./src/services/thesisProcessor');
    
    // Bật chế độ tự động xử lý
    const autoProcessor = require('./src/services/autoProcessor');
    const startResult = autoProcessor.startAutomaticProcessing();
    
    console.log('Hệ thống xử lý luận văn đã được khởi động:', startResult);
  } catch (error) {
    console.error('Lỗi khi khởi động hệ thống xử lý luận văn:', error);
    process.exit(1);
  }
}

// Xử lý tắt graceful
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  try {
    // Dừng hệ thống xử lý tự động
    const autoProcessor = require('./src/services/autoProcessor');
    const stopResult = autoProcessor.stopAutomaticProcessing();
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
