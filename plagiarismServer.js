/**
 * Server xử lý đạo văn
 * Server này chạy tách biệt với API server chính để xử lý các công việc kiểm tra đạo văn
 */
require('dotenv').config();
const mongoose = require('mongoose');

// Kết nối database
const DB_URI = process.env.MONGODB_URI || process.env.DB_URL || 'mongodb://localhost:27017/iuh-plagcheck';
console.log(`[Worker] Kết nối đến database: ${DB_URI}`);

mongoose.connect(DB_URI)
  .then(() => console.log('[Worker] Kết nối database thành công'))
  .catch(err => {
    console.error('[Worker] Lỗi kết nối database:', err);
    process.exit(1);
  });

// Đảm bảo đã load models trước khi khởi động worker
require('./src/models/Thesis');
require('./src/models/User');

// Khởi động worker
require('./workers/plagiarismWorker');

console.log('[Worker] Plagiarism server đang chạy và lắng nghe công việc mới');
