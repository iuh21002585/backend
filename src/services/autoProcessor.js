/**
 * Quản lý quá trình xử lý luận văn tự động
 * File này tích hợp trực tiếp hệ thống xử lý luận văn vào server
 * để không cần chạy script xử lý riêng biệt
 */

const Thesis = require('../models/Thesis');
const User = require('../models/User');
const thesisProcessor = require('../services/thesisProcessor');

let processingInterval = null;
const PROCESSING_INTERVAL_MS = 10000; // Kiểm tra mỗi 10 giây

/**
 * Khởi động hệ thống xử lý luận văn tự động
 */
function startAutomaticProcessing() {
  console.log('[AutoProcessor] Khởi động hệ thống xử lý luận văn tự động');
  
  if (processingInterval) {
    clearInterval(processingInterval);
  }
  
  // Xử lý một luận văn đang chờ ngay khi khởi động
  processNextPendingThesis().then(result => {
    if (result) {
      console.log(`[AutoProcessor] Đã khởi động xử lý luận văn: ${result}`);
    } else {
      console.log('[AutoProcessor] Không có luận văn nào đang chờ xử lý khi khởi động');
    }
  });
    // Thiết lập kiểm tra định kỳ
  processingInterval = setInterval(async () => {
    try {
      const status = thesisProcessor.getStatus();
      // console.log('[AutoProcessor] Kiểm tra định kỳ trạng thái xử lý luận văn:', JSON.stringify(status));
        // Kiểm tra số lượng luận văn đang ở trạng thái chờ xử lý
      try {
        const pendingCount = await Thesis.countDocuments({ status: 'pending' });
        const queuedCount = await Thesis.countDocuments({ status: 'queued' });
        // console.log(`[AutoProcessor] Có ${pendingCount} luận văn đang ở trạng thái "pending" và ${queuedCount} luận văn đang ở trạng thái "queued"`);
      } catch (err) {
        console.error('[AutoProcessor] Lỗi khi đếm luận văn đang chờ xử lý:', err);
      }
      
      // Nếu không có luận văn nào đang xử lý, kiểm tra và xử lý tiếp theo
      if (status.currentProcessingCount === 0) {
        // console.log('[AutoProcessor] Không có luận văn nào đang xử lý, tìm luận văn tiếp theo...');
        const result = await processNextPendingThesis();
        if (result) {
          // console.log(`[AutoProcessor] Đã tự động khởi động xử lý luận văn: ${result}`);        } else {
          // console.log('[AutoProcessor] Không tìm thấy luận văn nào đang chờ xử lý (pending/queued)');
        }
      } else {
        console.log(`[AutoProcessor] Đang xử lý ${status.currentProcessingCount} luận văn, chờ hoàn thành...`);
      }
    } catch (error) {
      console.error('[AutoProcessor] Lỗi khi kiểm tra luận văn đang chờ:', error);
    }
  }, PROCESSING_INTERVAL_MS);
  
  return {
    success: true,
    message: 'Đã khởi động hệ thống xử lý luận văn tự động'
  };
}

/**
 * Dừng hệ thống xử lý luận văn tự động
 */
function stopAutomaticProcessing() {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    console.log('[AutoProcessor] Đã dừng hệ thống xử lý luận văn tự động');
    return { success: true, message: 'Đã dừng hệ thống xử lý luận văn tự động' };
  }
  
  return { 
    success: false, 
    message: 'Hệ thống xử lý luận văn tự động chưa được khởi động' 
  };
}

/**
 * Xử lý luận văn tiếp theo đang ở trạng thái chờ
 */
async function processNextPendingThesis() {
  try {
    // Tìm luận văn đang ở trạng thái chờ (pending hoặc queued)
    const thesis = await Thesis.findOne({ 
      status: { $in: ['pending', 'queued'] } 
    });
    
    if (!thesis) {
      // Không có luận văn nào đang chờ
      return null;
    }
      // Tìm thông tin người dùng (kiểm tra cả trường 'user' và 'userId')
    const userId = thesis.user || thesis.userId;
    
    if (!userId) {
      console.error(`[AutoProcessor] Không tìm thấy thông tin userId cho luận văn ${thesis._id}`);
      return null;
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      console.error(`[AutoProcessor] Không tìm thấy người dùng cho luận văn ${thesis._id} với userId = ${userId}`);
      return null;
    }
    
    console.log(`[AutoProcessor] Tìm thấy người dùng ${user.email} cho luận văn ${thesis._id}`);
    
    // Đưa vào xử lý
    thesisProcessor.submitThesis(thesis._id, {
      userId: userId,
      userEmail: user.email
    });
    
    return thesis._id;
  } catch (error) {
    console.error('[AutoProcessor] Lỗi khi xử lý luận văn tiếp theo:', error);
    return null;
  }
}

/**
 * Lấy trạng thái hiện tại của hệ thống xử lý luận văn tự động
 */
function getAutoProcessorStatus() {
  return {
    running: !!processingInterval,
    processorStatus: thesisProcessor.getStatus()
  };
}

/**
 * Đăng ký các event listeners để tự động dừng khi server dừng
 */
function registerShutdownHandlers() {
  // Xử lý khi nhận tín hiệu kết thúc tiến trình
  process.on('SIGTERM', () => {
    console.log('[AutoProcessor] Nhận tín hiệu SIGTERM, đang dừng hệ thống xử lý luận văn tự động');
    stopAutomaticProcessing();
  });
  
  process.on('SIGINT', () => {
    console.log('[AutoProcessor] Nhận tín hiệu SIGINT, đang dừng hệ thống xử lý luận văn tự động');
    stopAutomaticProcessing();
  });
  
  // Xử lý khi tiến trình sắp kết thúc
  process.on('exit', () => {
    console.log('[AutoProcessor] Tiến trình đang kết thúc, đảm bảo tất cả đã dừng');
    if (processingInterval) {
      clearInterval(processingInterval);
      processingInterval = null;
    }
  });
  
  console.log('[AutoProcessor] Đã đăng ký xử lý tự động dừng khi server dừng');
}

// Tự động đăng ký handlers
registerShutdownHandlers();

module.exports = {
  startAutomaticProcessing,
  stopAutomaticProcessing,
  processNextPendingThesis,
  getAutoProcessorStatus
};
