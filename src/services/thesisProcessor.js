/**
 * ThesisProcessor - Quản lý việc xử lý luận văn
 * 
 * Module này cung cấp các hàm để xử lý luận văn trực tiếp hoặc đưa vào hàng đợi
 * tùy thuộc vào số lượng xử lý hiện tại.
 */

const Thesis = require('../models/Thesis');
const { performPlagiarismCheck } = require('../services/plagiarismService');
const { sendPlagiarismCompletionEmail } = require('../services/emailService');

// Hằng số cấu hình
const MAX_CONCURRENT_PROCESSING = 1; // Số lượng luận văn tối đa có thể xử lý cùng lúc

// Theo dõi trạng thái xử lý
const processingState = {
  currentProcessingCount: 0,
  processingTheses: new Set(),
  pendingQueue: []
};

/**
 * Kiểm tra xem có thể xử lý trực tiếp hay không
 * @returns {boolean} true nếu có thể xử lý trực tiếp, false nếu nên đưa vào hàng đợi
 */
function canProcessDirectly() {
  return processingState.currentProcessingCount < MAX_CONCURRENT_PROCESSING;
}

/**
 * Thêm luận văn vào hàng đợi
 * @param {Object} thesis - Thông tin luận văn
 * @param {Object} options - Tùy chọn xử lý
 * @param {Function} callback - Callback khi hoàn thành
 */
function addToQueue(thesisId, options, callback) {
  processingState.pendingQueue.push({ thesisId, options, callback });
  console.log(`[ThesisProcessor] Đã thêm luận văn ${thesisId} vào hàng đợi, hiện có ${processingState.pendingQueue.length} luận văn đang đợi`);
}

/**
 * Xử lý luận văn tiếp theo trong hàng đợi
 */
async function processNextInQueue() {
  if (processingState.pendingQueue.length === 0 || processingState.currentProcessingCount >= MAX_CONCURRENT_PROCESSING) {
    return;
  }
  
  const { thesisId, options, callback } = processingState.pendingQueue.shift();
  await processThesis(thesisId, options, callback);
}

/**
 * Xử lý luận văn
 * @param {string} thesisId - ID của luận văn
 * @param {Object} options - Tùy chọn xử lý
 * @param {Function} callback - Callback khi hoàn thành
 */
async function processThesis(thesisId, options, callback = () => {}) {
  // Cập nhật trạng thái
  processingState.currentProcessingCount++;
  processingState.processingTheses.add(thesisId);
  
  try {
    console.log(`[ThesisProcessor] Bắt đầu xử lý luận văn ${thesisId}`);
    
    // Cập nhật trạng thái trong database
    await Thesis.findByIdAndUpdate(thesisId, { status: 'processing' });
    
    // Lấy thông tin luận văn đầy đủ
    const thesis = await Thesis.findById(thesisId);
    if (!thesis) throw new Error('Không tìm thấy luận văn');
    
    console.log(`[ThesisProcessor] Đang kiểm tra đạo văn cho: ${thesis.title}`);
    
    // Thực hiện kiểm tra đạo văn
    const results = await performPlagiarismCheck(thesis, options);
    
    console.log(`[ThesisProcessor] Hoàn thành kiểm tra đạo văn cho: ${thesis.title}`);
    
    // Cập nhật kết quả vào database
    const updatedThesis = await Thesis.findByIdAndUpdate(
      thesisId, 
      {
        status: 'completed',
        plagiarismPercentage: results.plagiarismScore || 0,
        aiContentPercentage: results.aiPlagiarismScore || 0,
        sources: results.sources || [],
        textMatches: results.textMatches || [],
        plagiarismDetails: results.plagiarismDetails || [],
        aiPlagiarismDetails: results.aiPlagiarismDetails || [],
        completedAt: new Date()
      },
      { new: true }
    );
    
    // Gửi email thông báo nếu có user email
    if (options.userEmail) {
      await sendPlagiarismCompletionEmail(options.userEmail, updatedThesis);
      console.log(`[ThesisProcessor] Đã gửi email thông báo cho: ${options.userEmail}`);
    }
    
    // Gọi callback với kết quả
    callback(null, updatedThesis);
  } catch (error) {
    console.error(`[ThesisProcessor] Lỗi khi xử lý luận văn ${thesisId}:`, error);
    
    // Cập nhật trạng thái lỗi
    await Thesis.findByIdAndUpdate(thesisId, { 
      status: 'error',
      errorMessage: error.message || 'Lỗi không xác định'
    });
    
    // Gọi callback với lỗi
    callback(error);
  } finally {
    // Cập nhật trạng thái
    processingState.currentProcessingCount--;
    processingState.processingTheses.delete(thesisId);
    
    // Kiểm tra và xử lý luận văn tiếp theo trong hàng đợi
    processNextInQueue();
  }
}

/**
 * Xử lý luận văn hoặc đưa vào hàng đợi nếu đang có nhiều luận văn đang được xử lý
 * @param {string} thesisId - ID của luận văn
 * @param {Object} options - Tùy chọn xử lý
 * @returns {Promise} Promise chờ hoàn thành
 */
function submitThesis(thesisId, options = {}) {
  console.log(`[ThesisProcessor] Nhận yêu cầu xử lý luận văn ${thesisId} với options:`, JSON.stringify(options));
  
  return new Promise((resolve, reject) => {
    if (canProcessDirectly()) {
      // Xử lý trực tiếp
      console.log(`[ThesisProcessor] Có thể xử lý trực tiếp luận văn ${thesisId}`);
      processThesis(thesisId, options, (error, result) => {
        if (error) {
          console.error(`[ThesisProcessor] Lỗi khi xử lý trực tiếp luận văn ${thesisId}:`, error);
          reject(error);
        } else {
          console.log(`[ThesisProcessor] Hoàn thành xử lý trực tiếp luận văn ${thesisId}`);
          resolve(result);
        }
      });
    } else {
      // Đưa vào hàng đợi
      console.log(`[ThesisProcessor] Không thể xử lý trực tiếp, đưa luận văn ${thesisId} vào hàng đợi`);
      addToQueue(thesisId, options, (error, result) => {
        if (error) {
          console.error(`[ThesisProcessor] Lỗi khi xử lý luận văn ${thesisId} từ hàng đợi:`, error);
          reject(error);
        } else {
          console.log(`[ThesisProcessor] Hoàn thành xử lý luận văn ${thesisId} từ hàng đợi`);
          resolve(result);
        }
      });
    }
  });
}

/**
 * Lấy thông tin trạng thái hiện tại
 */
function getStatus() {
  return {
    currentProcessingCount: processingState.currentProcessingCount,
    processingTheses: Array.from(processingState.processingTheses),
    queueLength: processingState.pendingQueue.length,
    maxConcurrent: MAX_CONCURRENT_PROCESSING
  };
}

module.exports = {
  submitThesis,
  processThesis,
  getStatus,
  canProcessDirectly,
  processNextInQueue
};
