/**
 * mainService.js
 * Module chính điều phối các quy trình phát hiện đạo văn
 * Phiên bản đã được sửa để giới hạn kích thước dữ liệu
 */

const traditionalPlagiarism = require('./traditionalPlagiarism');
const webPlagiarism = require('./webPlagiarism');
const aiPlagiarism = require('./aiPlagiarism');
const Thesis = require('../../models/Thesis');
const { generatePlagiarismReport } = require('./reportGenerator');

/**
 * Giới hạn kích thước của các danh sách kết quả để tránh lỗi MongoDB BSON size limit
 * @param {Array} items - Danh sách các mục cần giới hạn
 * @param {number} maxItems - Số lượng tối đa các mục cần giữ lại
 * @returns {Array} - Danh sách đã giới hạn
 */
function limitArraySize(items, maxItems = 100) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, maxItems);
}

/**
 * Giới hạn kích thước văn bản để tránh lỗi MongoDB BSON size limit
 * @param {string} text - Văn bản cần giới hạn
 * @param {number} maxChars - Số ký tự tối đa
 * @returns {string} - Văn bản đã giới hạn
 */
function limitTextSize(text, maxChars = 1000) {
  if (!text || typeof text !== 'string') return '';
  return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
}

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
      try {
        [dbPlagiarismResult, webPlagiarismResult] = await Promise.all([
          traditionalPlagiarism.detectPlagiarismInDatabase(thesisId, thesis.content),
          webPlagiarism.detectPlagiarismFromWeb(thesis.content)
        ]);
        
        console.log(`Kết quả đạo văn cơ sở dữ liệu: ${dbPlagiarismResult.plagiarismScore}%, số chi tiết: ${dbPlagiarismResult.plagiarismDetails?.length || 0}`);
        console.log(`Kết quả đạo văn web: ${webPlagiarismResult.webPlagiarismScore}%, số nguồn: ${webPlagiarismResult.sources?.length || 0}, số trùng khớp: ${webPlagiarismResult.textMatches?.length || 0}`);
      } catch (error) {
        console.error('Lỗi khi kiểm tra đạo văn truyền thống:', error);
        dbPlagiarismResult = { plagiarismScore: 0, plagiarismDetails: [] };
        webPlagiarismResult = { webPlagiarismScore: 0, sources: [], textMatches: [] };
      }
    }
    
    // Tích hợp kết quả đạo văn truyền thống
    const combinedPlagiarismScore = checkTraditionalPlagiarism ? 
      Math.round((dbPlagiarismResult.plagiarismScore + webPlagiarismResult.webPlagiarismScore) / 2) : 0;
    
    // Giới hạn kích thước chi tiết để tránh lỗi BSON size limit
    const limitedPlagiarismDetails = limitArraySize(dbPlagiarismResult.plagiarismDetails, 50);
    // Giới hạn độ dài nội dung văn bản trong chi tiết
    limitedPlagiarismDetails.forEach(detail => {
      if (detail.matchedText) {
        detail.matchedText = limitTextSize(detail.matchedText, 500);
      }
    });
    
    // Giới hạn kích thước nguồn và text matches
    const limitedSources = limitArraySize(webPlagiarismResult.sources, 20);
    const limitedTextMatches = limitArraySize(webPlagiarismResult.textMatches, 50);
    
    // Giới hạn độ dài văn bản trong text matches
    limitedTextMatches.forEach(match => {
      if (match.sourceText) {
        match.sourceText = limitTextSize(match.sourceText, 300);
      }
      if (match.thesisText) {
        match.thesisText = limitTextSize(match.thesisText, 300);
      }
    });
    
    // Kết quả phát hiện đạo văn AI
    let aiPlagiarismResult = {
      aiPlagiarismScore: 0,
      aiPlagiarismDetails: [],
    };
    
    // Phát hiện đạo văn AI nếu được yêu cầu
    if (checkAiPlagiarism) {
      try {
        aiPlagiarismResult = await aiPlagiarism.detectAIPlagiarism(thesis.content);
        console.log(`Kết quả đạo văn AI: ${aiPlagiarismResult.aiPlagiarismScore}%, số chi tiết: ${aiPlagiarismResult.aiPlagiarismDetails?.length || 0}`);
      } catch (error) {
        console.error('Lỗi khi kiểm tra đạo văn AI:', error);
        aiPlagiarismResult = {
          aiPlagiarismScore: 0,
          aiPlagiarismDetails: [],
        };
      }
    }
    
    // Giới hạn kích thước chi tiết AI để tránh lỗi BSON size limit
    const limitedAiPlagiarismDetails = limitArraySize(aiPlagiarismResult.aiPlagiarismDetails, 20);
    // Giới hạn độ dài nội dung văn bản trong chi tiết AI
    limitedAiPlagiarismDetails.forEach(detail => {
      if (detail.matchedText) {
        detail.matchedText = limitTextSize(detail.matchedText, 500);
      }
    });
    
    // Tổng hợp kết quả
    const result = {
      plagiarismScore: combinedPlagiarismScore,
      aiPlagiarismScore: aiPlagiarismResult.aiPlagiarismScore,
      plagiarismDetails: limitedPlagiarismDetails,
      aiPlagiarismDetails: limitedAiPlagiarismDetails,
      sources: limitedSources,
      textMatches: limitedTextMatches,
    };
    
    // Tính thời gian xử lý (giây)
    const endTime = Date.now();
    const processingTime = Math.round((endTime - startTime) / 1000);
    console.log(`Thời gian xử lý cho luận văn ${thesisId}: ${processingTime} giây`);
    
    // Lưu thời gian xử lý vào luận văn
    thesis.processingTime = processingTime;
    
    try {
      // Cập nhật kết quả vào cơ sở dữ liệu
      console.log(`Bắt đầu lưu kết quả vào cơ sở dữ liệu cho luận văn ${thesisId}`);
      
      // Cập nhật từng phần riêng biệt để tránh lỗi kích thước
      await Thesis.findByIdAndUpdate(thesisId, { 
        status: 'completed',
        plagiarismScore: result.plagiarismScore,
        aiPlagiarismScore: result.aiPlagiarismScore,
        processingTime: processingTime,
        completedAt: new Date()
      });
      
      // Cập nhật sources
      await Thesis.findByIdAndUpdate(thesisId, { 
        sources: result.sources 
      });
      
      // Cập nhật plagiarismDetails
      await Thesis.findByIdAndUpdate(thesisId, { 
        plagiarismDetails: result.plagiarismDetails
      });
      
      // Cập nhật aiPlagiarismDetails
      await Thesis.findByIdAndUpdate(thesisId, { 
        aiPlagiarismDetails: result.aiPlagiarismDetails
      });
      
      // Cập nhật textMatches
      await Thesis.findByIdAndUpdate(thesisId, { 
        textMatches: result.textMatches
      });
      
      console.log(`Đã lưu kết quả vào cơ sở dữ liệu cho luận văn ${thesisId}`);
    } catch (dbError) {
      console.error(`Lỗi khi lưu kết quả vào cơ sở dữ liệu: ${dbError.message}`);
      // Vẫn tiếp tục để có thể tạo báo cáo
    }
    
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
      
      try {
        // Chờ tất cả các báo cáo được tạo xong
        const reportResults = await Promise.all(reportPromises);
        
        // Thêm thông tin đường dẫn báo cáo vào kết quả và cập nhật model Thesis
        const updates = {};
        
        reportResults.forEach(reportResult => {
          if (reportResult.success) {
            console.log(`Đã tạo báo cáo thành công: ${reportResult.reportPath}`);
            
            // Cập nhật đường dẫn báo cáo vào model Thesis tùy theo loại
            if (reportResult.reportType === 'traditional') {
              updates.plagiarismReportPath = reportResult.reportPath;
            } else if (reportResult.reportType === 'ai') {
              updates.aiPlagiarismReportPath = reportResult.reportPath;
            }
          } else {
            console.error(`Lỗi khi tạo báo cáo: ${reportResult.error}`);
          }
        });
        
        // Lưu đường dẫn báo cáo vào cơ sở dữ liệu nếu có cập nhật
        if (Object.keys(updates).length > 0) {
          await Thesis.findByIdAndUpdate(thesisId, updates);
          console.log(`Đã cập nhật đường dẫn báo cáo cho luận văn ${thesisId}`);
        }
      } catch (reportError) {
        console.error('Lỗi khi tạo báo cáo:', reportError);
      }
    }
    
    return result;
  } catch (error) {
    console.error('Lỗi khi phát hiện đạo văn:', error);
    // Cập nhật trạng thái lỗi
    try {
      await Thesis.findByIdAndUpdate(thesisId, { 
        status: 'error',
        errorMessage: error.message || 'Lỗi không xác định khi phát hiện đạo văn'
      });
    } catch (updateError) {
      console.error('Không thể cập nhật trạng thái lỗi:', updateError);
    }
    throw error;
  }
};

module.exports = {
  detectPlagiarism
};
