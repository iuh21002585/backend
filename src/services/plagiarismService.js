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

// Xuất các hàm cho các module khác sử dụng
module.exports = {
  detectPlagiarism,
  detectPlagiarismInDatabase,
  detectPlagiarismFromWeb,
  detectAIPlagiarism,
  generatePlagiarismReport,
};
