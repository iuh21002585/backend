const { thesisQueue, notificationQueue } = require('../queues');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Nhập module plagiarismWorker
let plagiarismProcessor;
try {
  // Thử import từ thư mục hiện tại
  plagiarismProcessor = require('./plagiarismWorker');
} catch (error) {
  // Nếu không tìm thấy, thử import từ thư mục gốc của workers
  try {
    plagiarismProcessor = require('../../workers/plagiarismWorker');
    console.log('[Worker] Đã tìm thấy plagiarismWorker trong thư mục workers gốc');
  } catch (importError) {
    console.error('[Worker] Không thể tìm thấy plagiarismWorker:', importError);
    // Tạo processor rỗng để tránh lỗi
    plagiarismProcessor = {
      process: async (data) => {
        console.error('[Worker] plagiarismWorker chưa được cài đặt đúng');
        return { error: 'Worker not properly configured' };
      }
    };
  }
}

// Tạo processor cho thông báo
const notificationProcessor = {
  process: async (data) => {
    try {
      console.log(`[Worker] Đang xử lý thông báo: ${data.type} cho user ${data.userId}`);
      
      // Ở đây bạn có thể thêm logic gửi email, push notification, v.v.
      // Bạn cũng có thể gọi service khác hoặc thực hiện các tác vụ nền
      
      return { success: true, message: 'Notification processed' };
    } catch (error) {
      console.error('[Worker] Lỗi xử lý thông báo:', error);
      return { success: false, error: error.message };
    }
  }
};

// Khởi động các worker processes
function initWorkers() {
  console.log('[Worker] Khởi động worker system...');

  // Số lượng worker tối đa dựa trên cấu hình hoặc số CPU
  const maxConcurrency = parseInt(process.env.MAX_WORKER_CONCURRENCY) || Math.max(os.cpus().length - 1, 1);
  console.log(`[Worker] Cấu hình concurrency: ${maxConcurrency} workers`);

  // Xử lý luận văn - giới hạn concurrency để tránh quá tải
  thesisQueue.process(Math.min(2, maxConcurrency), async (job) => {
    console.log(`[Worker] Đang xử lý luận văn: ${job.data.thesisId}`);
    try {
      return await plagiarismProcessor.process(job.data);
    } catch (error) {
      console.error(`[Worker] Lỗi xử lý luận văn: ${job.data.thesisId}`, error);
      throw error; // Rethrow để Bull có thể xử lý retry
    }
  });

  // Xử lý thông báo - có thể xử lý nhiều concurrency vì nhẹ hơn
  notificationQueue.process(Math.min(5, maxConcurrency), async (job) => {
    console.log(`[Worker] Đang gửi thông báo: ${job.data.type}`);
    try {
      return await notificationProcessor.process(job.data);
    } catch (error) {
      console.error(`[Worker] Lỗi gửi thông báo: ${job.data.type}`, error);
      throw error;
    }
  });

  // Xử lý các events
  thesisQueue.on('completed', (job, result) => {
    console.log(`[Worker] Xử lý luận văn hoàn tất: ${job.data.thesisId}`);
    // Có thể thêm thông báo thành công
    notificationQueue.add({
      userId: job.data.userId,
      type: 'thesis_completed',
      thesisId: job.data.thesisId,
      message: `Luận văn của bạn đã được phân tích xong.`,
      link: `/thesis/${job.data.thesisId}`,
      linkText: 'Xem kết quả'
    });
  });

  thesisQueue.on('failed', (job, err) => {
    console.error(`[Worker] Lỗi xử lý luận văn: ${job.data.thesisId}`, err);
    // Có thể thêm thông báo lỗi
    notificationQueue.add({
      userId: job.data.userId,
      type: 'thesis_error',
      thesisId: job.data.thesisId,
      message: `Có lỗi xảy ra khi xử lý luận văn của bạn: ${err.message || 'Lỗi không xác định'}`,
      link: `/thesis/${job.data.thesisId}`,
      linkText: 'Xem chi tiết'
    });
  });

  // Giám sát metrics
  setInterval(async () => {
    try {
      const thesisCounts = await thesisQueue.getJobCounts();
      const notifCounts = await notificationQueue.getJobCounts();
      console.log(`[Worker] Metrics - Thesis queue: ${JSON.stringify(thesisCounts)}, Notifications: ${JSON.stringify(notifCounts)}`);
    } catch (error) {
      console.error('[Worker] Error getting metrics:', error);
    }
  }, 300000); // 5 phút

  console.log('[Worker] Hệ thống worker đã sẵn sàng');
}

// Cung cấp phương thức graceful shutdown
async function shutdownWorkers() {
  console.log('[Worker] Đang dừng worker system...');
  try {
    await thesisQueue.close();
    await notificationQueue.close();
    console.log('[Worker] Đã đóng tất cả queues');
  } catch (error) {
    console.error('[Worker] Lỗi khi đóng queues:', error);
  }
}

module.exports = { 
  initWorkers,
  shutdownWorkers,
  thesisQueue,
  notificationQueue
};
