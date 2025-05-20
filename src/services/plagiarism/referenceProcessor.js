/**
 * referenceProcessor.js
 * Module xử lý các tài liệu tham khảo trong thư mục reference_database
 */
const fs = require('fs');
const path = require('path');
const util = require('util');
const readFile = util.promisify(fs.readFile);

// Đường dẫn tới thư mục reference_database
const REFERENCE_DIR = path.join(__dirname, '../../../reference_database');
// Đường dẫn tới file data.txt chứa dữ liệu tham khảo
const DATA_FILE_PATH = path.join(REFERENCE_DIR, 'data.txt');

/**
 * Kiểm tra xem file data.txt có tồn tại không
 * @returns {boolean} true nếu file tồn tại, false nếu không
 */
function checkDataFileExists() {
  return fs.existsSync(DATA_FILE_PATH);
}

/**
 * Tách nội dung file text thành các đoạn văn
 * @param {string} content - Nội dung văn bản
 * @returns {Array<string>} Mảng các đoạn văn
 */
function splitIntoParagraphs(content) {
  // Tách theo các dấu xuống dòng kép (đoạn văn)
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  return paragraphs;
}

/**
 * Đọc và xử lý file data.txt trong thư mục reference_database
 * @returns {Object} Đối tượng chứa nội dung và các đoạn văn đã xử lý
 */
async function processReferenceData() {
  try {
    console.log('Bắt đầu xử lý dữ liệu tham khảo từ file data.txt...');
    const startTime = Date.now();
    
    // Kiểm tra file data.txt
    if (!checkDataFileExists()) {
      console.log(`File ${DATA_FILE_PATH} không tồn tại.`);
      return {
        content: '',
        paragraphs: []
      };
    }
    
    // Đọc nội dung file
    const content = await readFile(DATA_FILE_PATH, 'utf-8');
    console.log(`Đã đọc file data.txt: ${content.length} ký tự`);
    
    if (content.length < 100) {
      console.log('Nội dung file data.txt quá ngắn để phân tích.');
      return {
        content: content,
        paragraphs: []
      };
    }
    
    // Tách thành các đoạn văn
    const paragraphs = splitIntoParagraphs(content);
    console.log(`Đã tách thành ${paragraphs.length} đoạn văn.`);
    
    const endTime = Date.now();
    const processingTime = Math.round((endTime - startTime) / 1000);
    
    console.log(`Hoàn thành xử lý file data.txt trong ${processingTime} giây`);
    
    return {
      content: content,
      paragraphs: paragraphs
    };
  } catch (error) {
    console.error('Lỗi khi xử lý file data.txt:', error);
    return {
      content: '',
      paragraphs: []
    };
  }
}

module.exports = {
  processReferenceData,
  checkDataFileExists,
  DATA_FILE_PATH
};
