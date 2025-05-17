/**
 * Script CLI để xử lý các luận văn đang ở trạng thái pending
 * Chạy lệnh: node process-theses.js
 */

// Load các biến môi trường
require('dotenv').config();

// Import các module cần thiết
const mongoose = require('mongoose');
const { processPendingTheses, processThesisById } = require('./src/controllers/processPendingTheses');

// Kết nối database
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Đã kết nối với MongoDB');
    
    // Lấy tham số dòng lệnh
    const args = process.argv.slice(2);
    let thesisId = null;
    
    // Nếu có tham số, xử lý theo ID
    if (args.length > 0 && args[0].match(/^[0-9a-fA-F]{24}$/)) {
      thesisId = args[0];
    }
    
    // Xử lý dựa vào tham số
    if (thesisId) {
      console.log(`Xử lý luận văn theo ID: ${thesisId}`);
      processThesisById(thesisId)
        .then(thesis => {
          console.log(`Đã xử lý thành công luận văn: ${thesis.title}`);
          process.exit(0);
        })
        .catch(err => {
          console.error('Lỗi khi xử lý luận văn:', err);
          process.exit(1);
        });
    } else {
      console.log('Xử lý tất cả luận văn đang chờ...');
      processPendingTheses()
        .then(count => {
          console.log(`Đã xử lý thành công ${count} luận văn`);
          process.exit(0);
        })
        .catch(err => {
          console.error('Lỗi khi xử lý các luận văn:', err);
          process.exit(1);
        });
    }
  })
  .catch(err => {
    console.error('Lỗi kết nối MongoDB:', err);
    process.exit(1);
  });
