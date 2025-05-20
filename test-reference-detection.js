/**
 * test-reference-detection.js
 * Script kiểm tra phát hiện đạo văn từ dữ liệu tham khảo
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Import các module cần thiết
const referenceProcessor = require('./src/services/plagiarism/referenceProcessor');
const utils = require('./src/services/plagiarism/utils');

// Kết nối database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iuh_plagcheck')
  .then(() => console.log('Đã kết nối tới MongoDB'))
  .catch(err => {
    console.error('Không thể kết nối tới MongoDB:', err);
    process.exit(1);
  });

/**
 * Kiểm tra phát hiện đạo văn với một đoạn văn thử nghiệm
 */
async function testPlagiarismDetection() {
  try {
    console.log('Bắt đầu kiểm tra phát hiện đạo văn với dữ liệu tham khảo...');
    
    // Kiểm tra sự tồn tại của file data.txt
    if (!referenceProcessor.checkDataFileExists()) {
      console.error(`File ${referenceProcessor.DATA_FILE_PATH} không tồn tại.`);
      console.log('Hãy tạo file data.txt trong thư mục reference_database trước khi chạy script này.');
      return;
    }
    
    // Tải dữ liệu từ file data.txt
    const referenceData = await referenceProcessor.processReferenceData();
    console.log(`Đã tải dữ liệu tham khảo với ${referenceData.paragraphs.length} đoạn văn.`);
    
    if (referenceData.paragraphs.length === 0) {
      console.error('Không có dữ liệu đoạn văn trong file data.txt.');
      return;
    }
    
    // Chọn ngẫu nhiên 3 đoạn văn từ dữ liệu tham khảo
    const sampleCount = Math.min(3, referenceData.paragraphs.length);
    const sampleParagraphs = [];
    
    for (let i = 0; i < sampleCount; i++) {
      const randomIndex = Math.floor(Math.random() * referenceData.paragraphs.length);
      const paragraph = referenceData.paragraphs[randomIndex];
      sampleParagraphs.push({
        index: randomIndex,
        content: paragraph
      });
    }
    
    // Tạo nội dung thử nghiệm
    const testContent = `
Đây là bài luận văn thử nghiệm để kiểm tra tính năng phát hiện đạo văn.
Bài luận văn này chứa một số đoạn văn được lấy trực tiếp từ dữ liệu tham khảo.

${sampleParagraphs[0].content}

Đây là phần nội dung nguyên gốc của bài luận văn.
Phần này không trùng với bất kỳ dữ liệu tham khảo nào.

${sampleParagraphs[1].content}

Phần tiếp theo là nội dung nguyên gốc của tác giả:
Đề tài nghiên cứu khoa học này tập trung vào việc phát triển các giải pháp mới cho các vấn đề phức tạp.
Thông qua nghiên cứu này, chúng tôi đề xuất một phương pháp tiếp cận mới.

${sampleParagraphs[2].content}

Tóm lại, bài luận văn này đã trình bày một số vấn đề chính và đề xuất các giải pháp.
Hy vọng kết quả nghiên cứu này sẽ đóng góp vào sự phát triển của lĩnh vực.
`;

    // Sử dụng tokenizer để phân tích nội dung
    const { tokenizer } = utils;
    const testWords = tokenizer.tokenize(testContent);
    
    console.log('\n==== THÔNG TIN BÀI LUẬN VĂN THỬ NGHIỆM ====');
    console.log(`Tổng số từ: ${testWords.length}`);
    console.log(`Số đoạn văn sao chép từ dữ liệu tham khảo: ${sampleParagraphs.length}`);
    
    // Hiển thị thông tin các đoạn sao chép
    console.log('\nCác đoạn văn được sao chép từ dữ liệu tham khảo:');
    sampleParagraphs.forEach((sample, index) => {
      console.log(`\n--- Đoạn ${index + 1} (từ đoạn số ${sample.index + 1} trong data.txt) ---`);
      
      // Hiển thị tóm tắt nội dung
      const summary = sample.content.length > 100 
        ? sample.content.substring(0, 100) + '...' 
        : sample.content;
      
      console.log(summary);
    });
    
    console.log('\n==== KẾT QUẢ ====');
    console.log('Các đoạn văn này sẽ được phát hiện là đạo văn khi sử dụng hệ thống kiểm tra.');
    console.log('Để thử nghiệm thực tế, hãy tải lên một luận văn có chứa các đoạn văn từ file data.txt.');
    console.log('\nBước tiếp theo:');
    console.log('1. Tạo một file văn bản mới (Word hoặc PDF)');
    console.log('2. Sao chép một số đoạn văn từ file data.txt vào file văn bản đó');
    console.log('3. Tải lên hệ thống để kiểm tra');
    console.log('4. Kiểm tra kết quả phát hiện đạo văn');
    
    console.log('\n==== HOÀN TẤT ====');
  } catch (error) {
    console.error('Lỗi khi thực hiện kiểm tra:', error);
  } finally {
    mongoose.disconnect();
    console.log('Đã ngắt kết nối MongoDB.');
  }
}

// Thực thi hàm kiểm tra
testPlagiarismDetection();
