/**
 * mainService.js
 * Module chính điều phối các quy trình phát hiện đạo văn
 */

const traditionalPlagiarism = require('./traditionalPlagiarism');
const webPlagiarism = require('./webPlagiarism');
const aiPlagiarism = require('./aiPlagiarism');
const Thesis = require('../../models/Thesis');
const { generatePlagiarismReport } = require('./reportGenerator');

/**
 * Hàm phát hiện đạo văn toàn diện và tạo báo cáo
 * @param {string} thesisId - ID của luận văn
 * @param {boolean} checkAiPlagiarism - Có kiểm tra đạo văn AI không
 * @param {boolean} checkTraditionalPlagiarism - Có kiểm tra đạo văn truyền thống không
 * @param {boolean} generateReport - Có tạo báo cáo PDF không
 * @returns {Object} Kết quả phát hiện đạo văn
 */
const detectPlagiarism = async (
  thesisId, 
  checkAiPlagiarism = true, 
  checkTraditionalPlagiarism = true,
  generateReport = true
) => {
  try {
    console.log(`Bắt đầu quá trình phát hiện đạo văn cho luận văn ${thesisId}`);
    console.log(`Các tùy chọn: Kiểm tra AI: ${checkAiPlagiarism}, Kiểm tra truyền thống: ${checkTraditionalPlagiarism}, Tạo báo cáo: ${generateReport}`);
    
    // Ghi lại thời gian bắt đầu
    const startTime = Date.now();
    
    // Lấy thông tin luận văn
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      throw new Error('Không tìm thấy luận văn');
    }
    
    // Kiểm tra nếu luận văn không có nội dung
    if (!thesis.content || thesis.content.length < 100) {
      return {
        plagiarismScore: 0,
        aiPlagiarismScore: 0,
        error: 'Nội dung luận văn quá ngắn để phân tích'
      };
    }

    // Khởi tạo kết quả mặc định cho đạo văn truyền thống
    let dbPlagiarismResult = {
      plagiarismScore: 0,
      plagiarismDetails: []
    };
    
    let webPlagiarismResult = {
      webPlagiarismScore: 0,
      sources: [],
      textMatches: []
    };

    // Thực hiện các quá trình phát hiện đạo văn song song để tăng tốc nếu được yêu cầu
    if (checkTraditionalPlagiarism) {
      [dbPlagiarismResult, webPlagiarismResult] = await Promise.all([
        traditionalPlagiarism.detectPlagiarismInDatabase(thesisId, thesis.content),
        webPlagiarism.detectPlagiarismFromWeb(thesis.content)
      ]);
    }
    
    // Tích hợp kết quả đạo văn truyền thống
    const combinedPlagiarismScore = checkTraditionalPlagiarism ? 
      Math.round((dbPlagiarismResult.plagiarismScore + webPlagiarismResult.webPlagiarismScore) / 2) : 0;
    
    // Kết hợp các nguồn được phát hiện
    const combinedPlagiarismDetails = [
      ...dbPlagiarismResult.plagiarismDetails,
    ];
    
    // Kết quả phát hiện đạo văn AI
    let aiPlagiarismResult = {
      aiPlagiarismScore: 0,
      aiPlagiarismDetails: [],
    };
    
    // Phát hiện đạo văn AI nếu được yêu cầu
    if (checkAiPlagiarism) {
      aiPlagiarismResult = await aiPlagiarism.detectAIPlagiarism(thesis.content);
    }
    
    // Tổng hợp kết quả
    const result = {
      plagiarismScore: combinedPlagiarismScore,
      aiPlagiarismScore: aiPlagiarismResult.aiPlagiarismScore,
      plagiarismDetails: combinedPlagiarismDetails,
      aiPlagiarismDetails: aiPlagiarismResult.aiPlagiarismDetails,
      sources: webPlagiarismResult.sources,
      textMatches: webPlagiarismResult.textMatches,
    };
    
    // Tính thời gian xử lý (giây)
    const endTime = Date.now();
    const processingTime = Math.round((endTime - startTime) / 1000);
    console.log(`Thời gian xử lý cho luận văn ${thesisId}: ${processingTime} giây`);
    
    // Lưu thời gian xử lý vào luận văn
    thesis.processingTime = processingTime;
    
    // Cập nhật kết quả vào cơ sở dữ liệu
    thesis.plagiarismScore = result.plagiarismScore;
    thesis.aiPlagiarismScore = result.aiPlagiarismScore;
    thesis.sources = result.sources;
    thesis.textMatches = result.textMatches;
    thesis.plagiarismDetails = result.plagiarismDetails;
    thesis.aiPlagiarismDetails = result.aiPlagiarismDetails;
    
    await thesis.save();
    
    // Tạo báo cáo PDF nếu được yêu cầu
    if (generateReport) {
      console.log(`Bắt đầu tạo báo cáo đạo văn cho luận văn ${thesisId}`);
      
      // Tạo báo cáo song song cho phát hiện đạo văn truyền thống và AI
      const reportPromises = [];
      
      if (checkTraditionalPlagiarism) {
        reportPromises.push(
          generatePlagiarismReport(thesisId, result, 'traditional')
        );
      }
      
      if (checkAiPlagiarism) {
        reportPromises.push(
          generatePlagiarismReport(thesisId, result, 'ai')
        );
      }
      
      // Chờ tất cả các báo cáo được tạo xong
      const reportResults = await Promise.all(reportPromises);
      
      // Thêm thông tin đường dẫn báo cáo vào kết quả và cập nhật model Thesis
      let hasUpdates = false;
      
      reportResults.forEach(reportResult => {
        if (reportResult.success) {
          console.log(`Đã tạo báo cáo thành công: ${reportResult.reportPath}`);
          
          // Cập nhật đường dẫn báo cáo vào model Thesis tùy theo loại
          if (reportResult.reportType === 'traditional') {
            thesis.plagiarismReportPath = reportResult.reportPath;
            hasUpdates = true;
          } else if (reportResult.reportType === 'ai') {
            thesis.aiPlagiarismReportPath = reportResult.reportPath;
            hasUpdates = true;
          }
        } else {
          console.error(`Lỗi khi tạo báo cáo: ${reportResult.error}`);
        }
      });
      
      // Lưu đường dẫn báo cáo vào cơ sở dữ liệu nếu có cập nhật
      if (hasUpdates) {
        await thesis.save();
        console.log(`Đã cập nhật đường dẫn báo cáo cho luận văn ${thesisId}`);
      }
    }
    
    return result;
  } catch (error) {
    console.error('Lỗi khi phát hiện đạo văn:', error);
    throw error;
  }
};

module.exports = {
  detectPlagiarism
};