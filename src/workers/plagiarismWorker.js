/**
 * Worker xử lý đạo văn - Phiên bản tương thích với Bull và hệ thống worker mới
 * Chức năng: Xử lý các công việc kiểm tra đạo văn từ hàng đợi
 */
const mongoose = require('mongoose');
const Thesis = require('../src/models/Thesis');
const { performPlagiarismCheck } = require('../src/services/plagiarismService');
const { sendPlagiarismCompletionEmail } = require('../src/services/emailService');

/**
 * Xử lý công việc kiểm tra đạo văn
 * @param {Object} data - Dữ liệu công việc từ queue
 * @returns {Promise<Object>} - Kết quả xử lý
 */
async function process(data) {
  const { thesisId, userId, userEmail } = data;
  console.log(`[PlagiarismWorker] Bắt đầu xử lý luận văn: ${thesisId}`);
  
  try {
    // Cập nhật trạng thái
    await Thesis.findByIdAndUpdate(thesisId, { status: 'processing' });
    
    // Lấy thông tin luận văn
    const thesis = await Thesis.findById(thesisId);
    if (!thesis) throw new Error('Không tìm thấy luận văn');
    
    console.log(`[PlagiarismWorker] Đã tìm thấy luận văn: ${thesis.title}`);
    
    // Thực hiện kiểm tra đạo văn
    const results = await performPlagiarismCheck(thesis);
    console.log(`[PlagiarismWorker] Đã hoàn thành kiểm tra đạo văn: ${thesis.title}`);
    
    // Cập nhật kết quả vào database
    const updatedThesis = await Thesis.findByIdAndUpdate(
      thesisId, 
      {
        status: 'completed',
        plagiarismPercentage: results.plagiarismPercentage,
        aiContentPercentage: results.aiContentPercentage,
        sources: results.sources,
        processedContent: results.processedContent,
        completedAt: new Date()
      },
      { new: true }
    );
    
    // Gửi email thông báo
    const emailSent = await sendPlagiarismCompletionEmail(userEmail, updatedThesis);
    console.log(`[PlagiarismWorker] Gửi email thông báo: ${emailSent ? 'Thành công' : 'Thất bại'}`);
    
    return { 
      success: true, 
      message: 'Kiểm tra đạo văn hoàn tất', 
      emailSent,
      results: {
        plagiarismPercentage: results.plagiarismPercentage,
        aiContentPercentage: results.aiContentPercentage,
        sourcesCount: results.sources?.length || 0
      }
    };
    
  } catch (error) {
    console.error(`[PlagiarismWorker] Lỗi khi xử lý luận văn ${thesisId}:`, error);
    
    // Cập nhật trạng thái lỗi
    await Thesis.findByIdAndUpdate(thesisId, { 
      status: 'error',
      errorMessage: error.message || 'Lỗi không xác định'
    });
    
    throw error;
  }
}

module.exports = { process };
