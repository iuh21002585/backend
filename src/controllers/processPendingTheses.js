/**
 * Công cụ xử lý các luận văn đang ở trạng thái chờ xử lý
 * File này cung cấp hàm để xử lý các luận văn đang pending mà không cần sử dụng Redis
 */

const Thesis = require('../models/Thesis');
const User = require('../models/User');
const { performPlagiarismCheck } = require('../services/plagiarismService');
const { sendPlagiarismCompletionEmail } = require('../services/emailService');

/**
 * Hàm xử lý tất cả luận văn đang ở trạng thái "pending"
 */
async function processPendingTheses() {
  try {
    console.log('[ProcessPending] Đang tìm các luận văn đang chờ xử lý...');
    
    // Tìm tất cả luận văn đang ở trạng thái "pending"
    const pendingTheses = await Thesis.find({ status: 'pending' });
    
    console.log(`[ProcessPending] Tìm thấy ${pendingTheses.length} luận văn đang chờ xử lý`);
    
    // Xử lý từng luận văn
    for (const thesis of pendingTheses) {
      console.log(`[ProcessPending] Đang xử lý luận văn: ${thesis._id} - ${thesis.title}`);
      
      try {
        // Cập nhật trạng thái
        thesis.status = 'processing';
        await thesis.save();
        
        // Lấy thông tin người dùng
        const user = await User.findById(thesis.userId);
        
        if (!user) {
          console.error(`[ProcessPending] Không tìm thấy người dùng cho luận văn ${thesis._id}`);
          continue;
        }
        
        // Thực hiện kiểm tra đạo văn
        const results = await performPlagiarismCheck(thesis, {
          checkAiPlagiarism: true,
          checkTraditionalPlagiarism: true
        });
        
        // Cập nhật kết quả
        thesis.status = 'completed';
        thesis.plagiarismPercentage = results.plagiarismPercentage;
        thesis.aiContentPercentage = results.aiContentPercentage;
        thesis.sources = results.sources;
        thesis.processedContent = results.processedContent;
        thesis.completedAt = new Date();
        
        await thesis.save();
        
        // Gửi email thông báo
        await sendPlagiarismCompletionEmail(user.email, thesis);
        console.log(`[ProcessPending] Đã xử lý và gửi email cho luận văn: ${thesis._id}`);
      } catch (error) {
        console.error(`[ProcessPending] Lỗi khi xử lý luận văn ${thesis._id}:`, error);
        
        // Cập nhật trạng thái lỗi
        thesis.status = 'error';
        thesis.errorMessage = error.message || 'Lỗi không xác định';
        await thesis.save();
      }
    }
    
    console.log('[ProcessPending] Đã xử lý xong tất cả luận văn đang chờ');
    return pendingTheses.length;
  } catch (err) {
    console.error('[ProcessPending] Lỗi khi xử lý các luận văn:', err);
    throw err;
  }
}

/**
 * Hàm xử lý một luận văn cụ thể theo ID
 * @param {string} thesisId - ID của luận văn cần xử lý
 */
async function processThesisById(thesisId) {
  try {
    console.log(`[ProcessById] Đang xử lý luận văn với ID: ${thesisId}`);
    
    // Tìm luận văn
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      throw new Error(`Không tìm thấy luận văn với ID: ${thesisId}`);
    }
    
    // Cập nhật trạng thái
    thesis.status = 'processing';
    await thesis.save();
    
    // Lấy thông tin người dùng
    const user = await User.findById(thesis.userId);
    
    if (!user) {
      throw new Error(`Không tìm thấy người dùng cho luận văn ${thesisId}`);
    }
    
    // Thực hiện kiểm tra đạo văn
    const results = await performPlagiarismCheck(thesis, {
      checkAiPlagiarism: true,
      checkTraditionalPlagiarism: true
    });
    
    // Cập nhật kết quả
    thesis.status = 'completed';
    thesis.plagiarismPercentage = results.plagiarismPercentage;
    thesis.aiContentPercentage = results.aiContentPercentage;
    thesis.sources = results.sources;
    thesis.processedContent = results.processedContent;
    thesis.completedAt = new Date();
    
    await thesis.save();
    
    // Gửi email thông báo
    await sendPlagiarismCompletionEmail(user.email, thesis);
    console.log(`[ProcessById] Đã xử lý và gửi email cho luận văn: ${thesisId}`);
    
    return thesis;
  } catch (err) {
    console.error(`[ProcessById] Lỗi khi xử lý luận văn ${thesisId}:`, err);
    throw err;
  }
}

module.exports = {
  processPendingTheses,
  processThesisById
};
