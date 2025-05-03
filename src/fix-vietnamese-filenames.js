/**
 * fix-vietnamese-filenames.js
 * Script để sửa lỗi encoding trong tên file tiếng Việt trên Backblaze B2
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');

// Đảm bảo dotenv được load
dotenv.config();

// Import B2Service và config đúng cách
const B2Service = require('./services/b2Service');
const { b2Config } = require('./config/b2');

// Kiểm tra các biến môi trường bắt buộc
function checkEnvironment() {
  const requiredEnvVars = [
    'B2_ACCESS_KEY_ID',
    'B2_SECRET_ACCESS_KEY',
    'B2_BUCKET_ID',
    'B2_BUCKET_NAME'
  ];
  
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error(`LỖI: Thiếu các biến môi trường bắt buộc cho Backblaze B2: ${missingEnvVars.join(', ')}`);
    console.error('Vui lòng kiểm tra file .env và đảm bảo đã cung cấp đầy đủ các biến môi trường.');
    return false;
  }
  return true;
}

// Kiểm tra môi trường trước khi tiếp tục
if (!checkEnvironment()) {
  process.exit(1);
}

// Khởi tạo B2Service
const b2Service = new B2Service(b2Config);

// Thư mục tạm để tải files xuống
const tempDir = path.join(os.tmpdir(), 'b2-vietnamese-fix');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Kiểm tra xem một chuỗi có chứa ký tự tiếng Việt bị lỗi encoding hay không
 * @param {string} str - Chuỗi cần kiểm tra
 * @return {boolean} - true nếu có lỗi encoding
 */
function hasEncodingIssues(str) {
  // Các ký tự tiếng Việt thường bị lỗi encoding
  const problematicPatterns = [
    'Ã¡', 'Ã ', 'áº£', 'Ã£', 'áº¡',  // a
    'Ã©', 'Ã¨', 'áº»', 'áº½', 'áº¹',  // e
    'Ã­', 'Ã¬', 'á»',  'Ã£', 'á»‹',  // i
    'Ã³', 'Ã²', 'á»',  'Ãµ', 'á»',   // o
    'Ãº', 'Ã¹', 'á»©', 'Å©', 'á»¥',   // u
    'Æ°', 'Æ¡', 'á»',  'Ã½', 'Ä',     // ư, ơ, y, đ
    'Äƒ', 'Ã¢', 'Ãª', 'Ã´', 'Æ°',     // ă, â, ê, ô, ư
  ];

  return problematicPatterns.some(pattern => str.includes(pattern));
}

/**
 * Sửa lỗi encoding của tên file tiếng Việt
 * @param {string} filename - Tên file có thể bị lỗi encoding
 * @return {string} - Tên file đã được sửa
 */
function fixVietnameseEncoding(filename) {
  // Thử decode tên file bị lỗi encoding
  try {
    // Giải mã ISO-8859-1 sang UTF-8
    const buffer = Buffer.from(filename, 'binary');
    const correctName = buffer.toString('utf8');
    
    // Kiểm tra xem kết quả có hợp lý không
    if (correctName.match(/[a-zA-Z0-9\s\-_\.]+/)) {
      return correctName;
    }
    
    // Nếu không phải là ISO-8859-1, thử CP1252
    const correctName2 = Buffer.from(filename, 'latin1').toString('utf8');
    return correctName2;
  } catch (err) {
    console.error(`Lỗi khi sửa tên file: ${filename}`, err);
    return filename; // Trả về tên gốc nếu không sửa được
  }
}

/**
 * Hàm chính để quét và sửa tất cả các file
 */
async function fixVietnameseFilenames() {
  console.log('===== BẮT ĐẦU SỬA TÊN FILE TIẾNG VIỆT TRONG B2 =====');
  
  try {
    // Bước 1: Xác thực với B2
    console.log('1. Đang kết nối đến Backblaze B2...');
    const authResult = await b2Service.authorize();
    if (!authResult.success) {
      console.error('Lỗi khi xác thực với B2:', authResult.error);
      return;
    }
    console.log('✓ Đã kết nối thành công với B2');
    
    // Bước 2: Liệt kê tất cả file trong bucket với prefix 'theses/'
    console.log('2. Đang lấy danh sách file từ thư mục theses/...');
    const listResult = await b2Service.listFiles('theses/', 1000);
    if (!listResult.success) {
      console.error('Lỗi khi liệt kê files:', listResult.error);
      return;
    }
    
    console.log(`✓ Đã tìm thấy ${listResult.files.length} files trong thư mục theses/`);
    
    // Bước 3: Kiểm tra và sửa từng file
    console.log('3. Đang kiểm tra các file có tên tiếng Việt bị lỗi encoding...');
    const filesToFix = [];
    
    for (const file of listResult.files) {
      const fileName = file.fileName;
      const baseName = path.basename(fileName);
      
      if (hasEncodingIssues(baseName)) {
        const correctedName = fixVietnameseEncoding(baseName);
        const correctedFullPath = fileName.replace(baseName, correctedName);
        
        if (correctedName !== baseName) {
          console.log(`Phát hiện file cần sửa: "${fileName}" -> "${correctedFullPath}"`);
          filesToFix.push({
            originalName: fileName,
            correctedName: correctedFullPath,
            fileId: file.fileId
          });
        }
      }
    }
    
    console.log(`✓ Đã phát hiện ${filesToFix.length} file cần sửa tên`);
    
    // Bước 4: Tải xuống và tải lại mỗi file với tên mới
    if (filesToFix.length === 0) {
      console.log('Không có file nào cần sửa tên.');
      return;
    }
    
    console.log('4. Bắt đầu quá trình sửa tên file...');
    
    for (let i = 0; i < filesToFix.length; i++) {
      const file = filesToFix[i];
      console.log(`\n[${i+1}/${filesToFix.length}] Đang xử lý: ${file.originalName}`);
      
      // Tải file xuống
      console.log(`  ↓ Đang tải xuống file...`);
      const downloadResult = await b2Service.downloadFile(file.originalName);
      if (!downloadResult.success) {
        console.error(`  ✗ Lỗi khi tải xuống file: ${downloadResult.error}`);
        continue;
      }
      
      // Lưu file vào thư mục tạm
      const tempFilePath = path.join(tempDir, path.basename(file.originalName));
      fs.writeFileSync(tempFilePath, downloadResult.data);
      console.log(`  ✓ Đã tải xuống và lưu vào: ${tempFilePath}`);
      
      // Tải lên với tên mới
      console.log(`  ↑ Đang tải lên lại với tên mới: ${file.correctedName}...`);
      const uploadResult = await b2Service.uploadFile(tempFilePath, file.correctedName);
      
      if (!uploadResult.success) {
        console.error(`  ✗ Lỗi khi tải lên file với tên mới: ${uploadResult.error}`);
        continue;
      }
      console.log(`  ✓ Đã tải lên thành công với tên mới`);
      
      // Xóa file cũ
      console.log(`  ⨯ Đang xóa file cũ với tên: ${file.originalName}...`);
      const deleteResult = await b2Service.deleteFile(file.originalName);
      if (!deleteResult.success) {
        console.error(`  ✗ Lỗi khi xóa file cũ: ${deleteResult.error}`);
        console.log(`  ! Cần xóa thủ công file: ${file.originalName}`);
      } else {
        console.log(`  ✓ Đã xóa file cũ thành công`);
      }
      
      // Xóa file tạm
      fs.unlinkSync(tempFilePath);
      console.log(`  ✓ Đã xóa file tạm thời`);
      console.log(`  ✓ Hoàn tất xử lý file ${i+1}/${filesToFix.length}`);
    }
    
    console.log('\n===== KẾT QUẢ =====');
    console.log(`Đã sửa thành công ${filesToFix.length} file có tên tiếng Việt bị lỗi encoding.`);
    console.log('Hoàn tất quá trình sửa tên file!');
    
  } catch (error) {
    console.error('Đã xảy ra lỗi không xác định:', error);
  }
}

// Thực thi chương trình
fixVietnameseFilenames().catch(err => {
  console.error('Lỗi không xử lý được:', err);
  process.exit(1);
});