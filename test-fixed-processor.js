/**
 * Script để kiểm tra bộ xử lý luận văn
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

// Import các module cần thiết
const Thesis = require('./src/models/Thesis');
const User = require('./src/models/User');
const referenceProcessor = require('./src/services/plagiarism/referenceProcessor');

// Import module mới đã sửa
const fixedMainService = require('./src/services/plagiarism/mainService.fixed');

/**
 * Kết nối đến cơ sở dữ liệu MongoDB
 */
async function connectToDatabase() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iuh_plagcheck';
    console.log(`Kết nối đến MongoDB: ${MONGODB_URI}`);
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Đã kết nối thành công đến MongoDB!');
  } catch (error) {
    console.error('Lỗi khi kết nối đến MongoDB:', error);
    process.exit(1);
  }
}

/**
 * Kiểm tra xem tài liệu tham khảo có tồn tại không
 */
function checkReferenceData() {
  console.log('\n=== KIỂM TRA DỮ LIỆU THAM KHẢO ===');
  
  const dataFilePath = referenceProcessor.DATA_FILE_PATH;
  console.log(`Đường dẫn đến file data.txt: ${dataFilePath}`);
  
  if (fs.existsSync(dataFilePath)) {
    const stats = fs.statSync(dataFilePath);
    console.log(`✅ File data.txt tồn tại với kích thước ${stats.size} bytes.`);
    
    // Đọc một phần nhỏ của file để xác nhận nội dung
    const content = fs.readFileSync(dataFilePath, 'utf-8', { encoding: 'utf-8', flag: 'r' });
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
    console.log(`🔍 Nội dung file (100 ký tự đầu): "${preview}"`);
    
    console.log(`📊 Tổng số ký tự: ${content.length}`);
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    console.log(`📝 Số đoạn văn: ${paragraphs.length}`);
    
    return { exists: true, content, paragraphs };
  } else {
    console.log(`❌ File data.txt không tồn tại tại đường dẫn ${dataFilePath}.`);
    return { exists: false };
  }
}

/**
 * Xử lý luận văn đang ở trạng thái chờ hoặc lỗi
 */
async function processPendingThesis() {
  console.log('\n=== XỬ LÝ LUẬN VĂN ĐANG CHỜ ===');
  
  // Tìm luận văn đang ở trạng thái chờ hoặc lỗi
  const thesis = await Thesis.findOne({
    status: { $in: ['pending', 'error'] }
  }).select('_id title userId content status');
  
  if (!thesis) {
    console.log('Không tìm thấy luận văn nào đang chờ xử lý.');
    return null;
  }
  
  console.log(`Tìm thấy luận văn: ${thesis.title} (${thesis._id}) - Trạng thái: ${thesis.status}`);
  
  // Tìm thông tin người dùng
  const user = await User.findById(thesis.userId);
  
  if (!user) {
    console.log(`Không tìm thấy người dùng cho luận văn ${thesis._id}.`);
  } else {
    console.log(`Luận văn thuộc về: ${user.name} (${user.email})`);
  }
  
  // Cập nhật trạng thái
  await Thesis.findByIdAndUpdate(thesis._id, { status: 'processing' });
  
  console.log('Bắt đầu xử lý luận văn...');
  
  try {
    // Sử dụng phiên bản fixed của mainService
    const result = await fixedMainService.detectPlagiarism(
      thesis._id,
      true,  // checkAiPlagiarism
      true,  // checkTraditionalPlagiarism
      true   // generateReport
    );
    
    console.log('\n=== KẾT QUẢ XỬ LÝ ===');
    console.log(`Tỷ lệ đạo văn truyền thống: ${result.plagiarismScore}%`);
    console.log(`Tỷ lệ nội dung AI: ${result.aiPlagiarismScore}%`);
    console.log(`Số nguồn phát hiện được: ${result.sources.length}`);
    console.log(`Số đoạn trùng khớp: ${result.textMatches.length}`);
    console.log(`Số chi tiết đạo văn: ${result.plagiarismDetails.length}`);
    console.log(`Số chi tiết AI: ${result.aiPlagiarismDetails.length}`);
    
    return result;
  } catch (error) {
    console.error('Lỗi khi xử lý luận văn:', error);
    await Thesis.findByIdAndUpdate(thesis._id, { 
      status: 'error', 
      errorMessage: error.message || 'Lỗi không xác định' 
    });
    return null;
  }
}

/**
 * Hàm chính
 */
async function main() {
  try {
    // Kết nối đến cơ sở dữ liệu
    await connectToDatabase();
    
    // Kiểm tra dữ liệu tham khảo
    const refData = checkReferenceData();
    
    // Chỉ tiếp tục nếu có dữ liệu tham khảo
    if (refData.exists) {
      // Xử lý luận văn đang chờ
      await processPendingThesis();
    } else {
      console.log('Vui lòng tạo file data.txt trong thư mục reference_database trước khi tiếp tục.');
    }
  } catch (error) {
    console.error('Lỗi:', error);
  } finally {
    // Ngắt kết nối MongoDB trước khi thoát
    await mongoose.disconnect();
    console.log('\nĐã ngắt kết nối từ MongoDB.');
  }
}

// Thực thi
main();
