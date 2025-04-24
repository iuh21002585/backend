/**
 * plagiarism/index.js
 * File xuất các chức năng phát hiện đạo văn
 */

const traditionalPlagiarism = require('./traditionalPlagiarism');
const aiPlagiarism = require('./aiPlagiarism');
const webPlagiarism = require('./webPlagiarism');
const utils = require('./utils');

module.exports = {
  // Hàm chính để phát hiện đạo văn
  detectPlagiarism: require('./mainService').detectPlagiarism,
  
  // Các hàm phát hiện đạo văn cụ thể
  detectPlagiarismInDatabase: traditionalPlagiarism.detectPlagiarismInDatabase,
  detectPlagiarismFromWeb: webPlagiarism.detectPlagiarismFromWeb,
  detectAIPlagiarism: aiPlagiarism.detectAIPlagiarism,
};
