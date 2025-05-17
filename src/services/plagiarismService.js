/**
 * PlagiarismService.js
 * File xuất các chức năng từ module phát hiện đạo văn
 */

// Import các module đã được module hóa
const { detectPlagiarism } = require('./plagiarism/mainService');
const { detectPlagiarismInDatabase } = require('./plagiarism/traditionalPlagiarism');
const { detectPlagiarismFromWeb } = require('./plagiarism/webPlagiarism');
const { detectAIPlagiarism } = require('./plagiarism/aiPlagiarism');
const { generatePlagiarismReport } = require('./plagiarism/reportGenerator');

/**
 * Wrapper function cho worker để xử lý kiểm tra đạo văn
 * @param {Object} thesis - Đối tượng luận văn
 * @param {Object} options - Tùy chọn kiểm tra đạo văn
 * @returns {Object} Kết quả phát hiện đạo văn
 */
async function performPlagiarismCheck(thesis, options = {}) {
  console.log(`[PlagiarismService] Bắt đầu kiểm tra đạo văn cho luận văn: ${thesis._id}`);
  
  const checkAiPlagiarism = options?.checkAiPlagiarism !== false;
  const checkTraditionalPlagiarism = options?.checkTraditionalPlagiarism !== false;
  
  console.log(`[PlagiarismService] Tùy chọn kiểm tra: AI=${checkAiPlagiarism}, Traditional=${checkTraditionalPlagiarism}`);
  
  // Gọi hàm chính để kiểm tra đạo văn
  const results = await detectPlagiarism(
    thesis._id,
    checkAiPlagiarism, 
    checkTraditionalPlagiarism
  );
  
  console.log(`[PlagiarismService] Hoàn thành kiểm tra đạo văn cho luận văn: ${thesis._id}`);
  return results;
}

// Xuất các hàm cho các module khác sử dụng
module.exports = {
  detectPlagiarism,
  detectPlagiarismInDatabase,
  detectPlagiarismFromWeb,
  detectAIPlagiarism,
  generatePlagiarismReport,
  performPlagiarismCheck,
};
