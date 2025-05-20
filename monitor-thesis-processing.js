/**
 * Script giám sát quy trình xử lý luận văn đang chạy
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Thesis = require('./src/models/Thesis');
const User = require('./src/models/User');
const thesisProcessor = require('./src/services/thesisProcessor');

// Kết nối database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iuh_plagcheck')
  .then(() => console.log('Đã kết nối tới MongoDB'))
  .catch(err => {
    console.error('Không thể kết nối tới MongoDB:', err);
    process.exit(1);
  });

/**
 * Kiểm tra trạng thái các luận văn
 */
async function checkThesisStatus() {
  try {
    const pendingCount = await Thesis.countDocuments({ status: 'pending' });
    const processingCount = await Thesis.countDocuments({ status: 'processing' });
    const completedCount = await Thesis.countDocuments({ status: 'completed' });
    const errorCount = await Thesis.countDocuments({ status: 'error' });
    
    console.log('\n=== THỐNG KÊ LUẬN VĂN ===');
    console.log(`- Chờ xử lý: ${pendingCount}`);
    console.log(`- Đang xử lý: ${processingCount}`);
    console.log(`- Đã hoàn thành: ${completedCount}`);
    console.log(`- Lỗi: ${errorCount}`);
    
    // Lấy trạng thái từ ThesisProcessor
    const processorStatus = thesisProcessor.getStatus();
    console.log('\n=== TRẠNG THÁI XỬ LÝ ===');
    console.log(`- Số lượng đang xử lý: ${processorStatus.currentProcessingCount}`);
    console.log(`- Danh sách đang xử lý: ${processorStatus.processingTheses.join(', ') || 'Không có'}`);
    console.log(`- Số lượng trong hàng đợi: ${processorStatus.queueLength}`);
    console.log(`- Số lượng xử lý tối đa: ${processorStatus.maxConcurrent}`);
    
    // Kiểm tra các luận văn đang xử lý
    if (processingCount > 0) {
      console.log('\n=== CHI TIẾT LUẬN VĂN ĐANG XỬ LÝ ===');
      const processingTheses = await Thesis.find({ status: 'processing' }).select('_id title createdAt');
      
      processingTheses.forEach((thesis, index) => {
        const createdTime = new Date(thesis.createdAt).toLocaleString();
        const processingTime = Math.round((Date.now() - new Date(thesis.createdAt).getTime()) / 1000 / 60);
        
        console.log(`${index + 1}. ID: ${thesis._id}`);
        console.log(`   Tiêu đề: ${thesis.title}`);
        console.log(`   Thời gian tạo: ${createdTime}`);
        console.log(`   Thời gian xử lý: ${processingTime} phút`);
      });
    }
    
    // Reset các luận văn bị treo
    if (processingCount > 0 && processorStatus.currentProcessingCount === 0) {
      console.log('\nPhát hiện luận văn bị treo trong cơ sở dữ liệu nhưng không được xử lý trong bộ nhớ!');
      console.log('Bạn có thể cần reset trạng thái của các luận văn này.');
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái luận văn:', error);
  }
}

/**
 * Xử lý luận văn tiếp theo
 */
async function processNextThesis() {
  try {
    console.log('\n=== XỬ LÝ LUẬN VĂN TIẾP THEO ===');
    // Lấy trạng thái từ ThesisProcessor
    const processorStatus = thesisProcessor.getStatus();
    
    if (processorStatus.currentProcessingCount >= processorStatus.maxConcurrent) {
      console.log('Đã đạt giới hạn xử lý tối đa. Không thể xử lý thêm luận văn.');
      return;
    }
    
    // Tìm luận văn đang ở trạng thái chờ (pending hoặc queued)
    const thesis = await Thesis.findOne({ 
      status: { $in: ['pending', 'queued'] } 
    });
    
    if (!thesis) {
      console.log('Không có luận văn nào đang chờ xử lý.');
      return;
    }
    
    console.log(`Tìm thấy luận văn chờ xử lý: ${thesis._id} - ${thesis.title}`);
    
    // Tìm thông tin người dùng (kiểm tra cả trường 'user' và 'userId')
    const userId = thesis.user || thesis.userId;
    
    if (!userId) {
      console.error(`Không tìm thấy thông tin userId cho luận văn ${thesis._id}`);
      return;
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      console.error(`Không tìm thấy người dùng cho luận văn ${thesis._id} với userId = ${userId}`);
      return;
    }
    
    console.log(`Tìm thấy người dùng ${user.email} cho luận văn ${thesis._id}`);
    
    // Đưa vào xử lý
    console.log(`Bắt đầu xử lý luận văn ${thesis._id}`);
    thesisProcessor.submitThesis(thesis._id, {
      userId: userId,
      userEmail: user.email
    });
    
    return thesis._id;
  } catch (error) {
    console.error('Lỗi khi xử lý luận văn tiếp theo:', error);
    return null;
  }
}

/**
 * Reset luận văn đang bị treo
 */
async function resetStuckTheses() {
  try {
    console.log('\n=== RESET LUẬN VĂN BỊ TREO ===');
    
    // Tìm các luận văn đang ở trạng thái processing
    const stuckTheses = await Thesis.find({ status: 'processing' });
    
    if (stuckTheses.length === 0) {
      console.log('Không có luận văn nào đang bị treo.');
      return;
    }
    
    console.log(`Tìm thấy ${stuckTheses.length} luận văn đang bị treo.`);
    
    // Đặt lại trạng thái về pending
    const result = await Thesis.updateMany(
      { status: 'processing' },
      { status: 'pending' }
    );
    
    console.log(`Đã reset ${result.modifiedCount} luận văn từ trạng thái 'processing' về 'pending'.`);
  } catch (error) {
    console.error('Lỗi khi reset luận văn bị treo:', error);
  }
}

/**
 * Hiển thị menu tương tác
 */
function showMenu() {
  console.log('\n=== MENU ===');
  console.log('1. Kiểm tra trạng thái luận văn');
  console.log('2. Xử lý luận văn tiếp theo');
  console.log('3. Reset luận văn bị treo');
  console.log('4. Thoát');
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('\nChọn một lựa chọn: ', async (choice) => {
    switch (choice) {
      case '1':
        await checkThesisStatus();
        break;
      case '2':
        await processNextThesis();
        break;
      case '3':
        await resetStuckTheses();
        break;
      case '4':
        console.log('Thoát chương trình...');
        mongoose.disconnect();
        process.exit(0);
        return;
      default:
        console.log('Lựa chọn không hợp lệ.');
    }
    
    readline.close();
    setTimeout(showMenu, 500);
  });
}

// Bắt đầu chương trình
console.log('=== CÔNG CỤ QUẢN LÝ XỬ LÝ LUẬN VĂN ===');
checkThesisStatus().then(() => showMenu());
