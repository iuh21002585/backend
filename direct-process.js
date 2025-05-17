/**
 * Script xử lý trực tiếp luận văn
 * 
 * Tệp này cung cấp cách xử lý luận văn trực tiếp mà không cần sử dụng Redis Queue
 * Phù hợp cho cả chế độ phát triển và triển khai nơi không cần xử lý nhiều luận văn đồng thời
 */

// Load các biến môi trường
require('dotenv').config();

// Import các module cần thiết
const mongoose = require('mongoose');
const Thesis = require('./src/models/Thesis');
const User = require('./src/models/User');
const thesisProcessor = require('./src/services/thesisProcessor');

/**
 * Kết nối với MongoDB
 */
async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('=== Kết nối MongoDB thành công ===');
  } catch (error) {
    console.error('Lỗi kết nối MongoDB:', error);
    process.exit(1);
  }
}

/**
 * Tìm và xử lý một luận văn đang chờ
 */
async function processNextPendingThesis() {
  const processorStatus = thesisProcessor.getStatus();
  
  if (processorStatus.currentProcessingCount > 0) {
    console.log(`Đang xử lý luận văn ${processorStatus.processingTheses[0]}, chờ hoàn thành...`);
    return;
  }
  
  try {
    // Tìm luận văn đầu tiên đang ở trạng thái chờ
    const thesis = await Thesis.findOne({ status: 'pending' });
    
    if (!thesis) {
      console.log('Không có luận văn nào đang chờ xử lý');
      return;
    }
    
    console.log(`\n=== Bắt đầu xử lý luận văn: ${thesis.title} (${thesis._id}) ===`);
    
    // Tìm thông tin người dùng
    const user = await User.findById(thesis.userId);
    
    if (!user) {
      throw new Error(`Không tìm thấy người dùng cho luận văn ${thesis._id}`);
    }
    
    console.log(`Luận văn thuộc về: ${user.name} (${user.email})`);
    
    // Đưa luận văn vào xử lý
    const updatedThesis = await thesisProcessor.submitThesis(thesis._id, {
      userId: thesis.userId,
      userEmail: user.email
    });
    
    console.log(`=== Hoàn thành xử lý luận văn: ${thesis._id} ===\n`);
    
    return updatedThesis;
  } catch (error) {
    console.error(`Lỗi khi xử lý luận văn:`, error);
  }
}

/**
 * Xử lý một luận văn cụ thể theo ID
 */
async function processSpecificThesis(thesisId) {
  const processorStatus = thesisProcessor.getStatus();
  
  if (processorStatus.currentProcessingCount > 0) {
    console.log(`Đã có ${processorStatus.currentProcessingCount} luận văn đang xử lý, đang kiểm tra...`);
  }
  
  try {
    // Tìm luận văn theo ID
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      throw new Error(`Không tìm thấy luận văn với ID: ${thesisId}`);
    }
    
    console.log(`\n=== Bắt đầu xử lý luận văn: ${thesis.title} (${thesis._id}) ===`);
    
    // Tìm thông tin người dùng
    const user = await User.findById(thesis.userId);
    
    if (!user) {
      throw new Error(`Không tìm thấy người dùng cho luận văn ${thesis._id}`);
    }
    
    console.log(`Luận văn thuộc về: ${user ? user.name : 'không tìm thấy người dùng'} (${user ? user.email : 'N/A'})`);
    
    // Đưa luận văn vào xử lý với ưu tiên cao
    const updatedThesis = await thesisProcessor.submitThesis(thesis._id, {
      userId: thesis.userId,
      userEmail: user ? user.email : null,
      priority: 'high'
    });
    
    return thesis;
  } catch (error) {
    console.error(`Lỗi khi xử lý luận văn ${thesisId}:`, error);
    throw error;
  }
}

/**
 * Hàm chính
 */
async function main() {
  try {
    // Kết nối đến cơ sở dữ liệu
    await connectToDatabase();
    
    // Phân tích tham số dòng lệnh
    const args = process.argv.slice(2);
    
    // Chế độ chạy
    const mode = args[0] || 'continuous';
    
    if (mode === 'continuous') {
      console.log('=== CHẾ ĐỘ XỬ LÝ LIÊN TỤC ===');
      console.log('Nhấn Ctrl+C để dừng xử lý\n');
      
      // Hàm xử lý liên tục
      const processLoop = async () => {
        const processorStatus = thesisProcessor.getStatus();
        console.log(`Trạng thái hiện tại: ${processorStatus.currentProcessingCount} đang xử lý, ${processorStatus.queueLength} đang đợi`);
        
        if (processorStatus.currentProcessingCount === 0) {
          await processNextPendingThesis();
        } else {
          console.log('Đã có luận văn đang xử lý, chờ hoàn thành...');
        }
        
        // Đợi 5 giây rồi kiểm tra tiếp
        setTimeout(processLoop, 5000);
      };
      
      // Bắt đầu xử lý
      processLoop();
    }
    else if (mode === 'once') {
      console.log('=== CHẾ ĐỘ XỬ LÝ MỘT LẦN ===');
      
      // Xử lý một luận văn rồi thoát
      const thesis = await processNextPendingThesis();
      
      if (thesis) {
        // Đợi một khoảng thời gian cho xử lý hoàn tất
        console.log('Đang đợi xử lý hoàn tất...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('Hoàn thành, đang thoát...');
      } else {
        console.log('Không có luận văn nào để xử lý, đang thoát...');
      }
      
      process.exit(0);
    }
    else if (mode === 'id' && args[1]) {
      console.log(`=== CHẾ ĐỘ XỬ LÝ THEO ID ===`);
      
      const thesisId = args[1];
      console.log(`Xử lý luận văn có ID: ${thesisId}`);
      
      await processSpecificThesis(thesisId);
      
      // Đợi một khoảng thời gian cho xử lý hoàn tất
      console.log('Đang đợi xử lý hoàn tất...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('Hoàn thành, đang thoát...');
      
      process.exit(0);
    }
    else if (mode === 'status') {
      console.log(`=== TRẠNG THÁI HỆ THỐNG XỬ LÝ ===`);
      const status = thesisProcessor.getStatus();
      console.log(JSON.stringify(status, null, 2));
      process.exit(0);
    }
    else {
      console.log('Cách sử dụng:');
      console.log('node direct-process.js                  - Chế độ xử lý liên tục');
      console.log('node direct-process.js once            - Xử lý một luận văn rồi thoát');
      console.log('node direct-process.js id [thesis_id]  - Xử lý luận văn theo ID');
      console.log('node direct-process.js status          - Hiển thị trạng thái xử lý');
      process.exit(1);
    }
  } catch (error) {
    console.error('Lỗi:', error);
    process.exit(1);
  }
}

// Xử lý khi nhấn Ctrl+C
process.on('SIGINT', () => {
  console.log('\nĐang dừng xử lý luận văn...');
  
  const processorStatus = thesisProcessor.getStatus();
  
  if (processorStatus.currentProcessingCount > 0) {
    console.log(`Vui lòng đợi để ${processorStatus.currentProcessingCount} luận văn đang xử lý hoàn thành`);
    
    // Kiểm tra định kỳ xem đã hoàn thành chưa
    const checkInterval = setInterval(() => {
      const currentStatus = thesisProcessor.getStatus();
      if (currentStatus.currentProcessingCount === 0) {
        console.log('Đã hoàn thành xử lý, thoát chương trình');
        clearInterval(checkInterval);
        process.exit(0);
      }
    }, 1000);
  } else {
    console.log('Không có luận văn nào đang xử lý, thoát chương trình');
    process.exit(0);
  }
});

// Bắt đầu chương trình
main();
