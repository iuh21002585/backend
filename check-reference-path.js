/**
 * Script kiểm tra đường dẫn đến file data.txt và thư mục reference_database
 */

const fs = require('fs');
const path = require('path');

// Các đường dẫn khả dụng cho thư mục reference_database
const possiblePaths = [
  // Đường dẫn tương đối từ vị trí script hiện tại
  './reference_database',
  '../reference_database',
  './backend/reference_database',
  
  // Đường dẫn tuyệt đối dựa trên __dirname
  path.join(__dirname, './reference_database'),
  path.join(__dirname, '../reference_database'),
  
  // Đường dẫn từ mã nguồn
  path.join(__dirname, 'src/services/plagiarism', '../../../reference_database'),
  
  // Đường dẫn tuyệt đối
  'd:/official_version/IUH_PLAGCHECK/backend/reference_database'
];

console.log('Kiểm tra các đường dẫn có thể của thư mục reference_database:');
console.log('-----------------------------------------------------');

for (const refPath of possiblePaths) {
  console.log(`Kiểm tra đường dẫn: ${refPath}`);
  
  try {
    // Kiểm tra xem thư mục có tồn tại không
    if (fs.existsSync(refPath)) {
      console.log(`✅ Thư mục ${refPath} tồn tại.`);
      
      // Kiểm tra file data.txt trong thư mục
      const dataFilePath = path.join(refPath, 'data.txt');
      
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
      } else {
        console.log(`❌ File data.txt không tồn tại trong thư mục ${refPath}.`);
      }
    } else {
      console.log(`❌ Thư mục ${refPath} không tồn tại.`);
    }
  } catch (error) {
    console.error(`❌ Lỗi khi kiểm tra đường dẫn ${refPath}:`, error.message);
  }
  
  console.log('-----------------------------------------------------');
}

// Kiểm tra module referenceProcessor
console.log('\nKiểm tra module referenceProcessor:');
console.log('-----------------------------------------------------');

try {
  const referenceProcessor = require('./src/services/plagiarism/referenceProcessor');
  console.log('✅ Đã tải module referenceProcessor thành công.');
  
  // Kiểm tra đường dẫn trong module
  console.log(`🔍 Đường dẫn DATA_FILE_PATH trong module: ${referenceProcessor.DATA_FILE_PATH}`);
  
  // Kiểm tra file data.txt qua module
  if (referenceProcessor.checkDataFileExists()) {
    console.log('✅ File data.txt được tìm thấy bởi module referenceProcessor.');
  } else {
    console.log('❌ File data.txt KHÔNG được tìm thấy bởi module referenceProcessor.');
  }
} catch (error) {
  console.error('❌ Lỗi khi tải module referenceProcessor:', error.message);
}

console.log('-----------------------------------------------------');