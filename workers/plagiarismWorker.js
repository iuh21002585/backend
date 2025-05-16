/**
 * Worker xử lý đạo văn
 * Worker này sẽ xử lý các công việc kiểm tra đạo văn từ hàng đợi
 */
const Queue = require('bull');
const mongoose = require('mongoose');
const Thesis = require('../src/models/Thesis');
const { performPlagiarismCheck } = require('../src/services/plagiarismService');
const { sendPlagiarismCompletionEmail } = require('../src/services/emailService');

// Kết nối Redis - dùng URL từ biến môi trường
const REDIS_URL = process.env.REDIS_URL || 'redis://default:AT9UAAIjcDExMDcyZDdjNmJkNTM0OWRlYjhjYWYyN2Q2YjZjMDg1M3AxMA@trusted-escargot-16212.upstash.io:6379';
if (!process.env.REDIS_URL) {
  console.warn('REDIS_URL không được định nghĩa trong biến môi trường. Đang sử dụng URL mặc định.');
}
const plagiarismQueue = new Queue('iuh-plagiarism-detection', REDIS_URL);

console.log('[Worker] Khởi tạo plagiarism queue với Redis:', REDIS_URL);

// Xử lý công việc từ queue
plagiarismQueue.process(async (job) => {
  const { thesisId, userId, userEmail } = job.data;
  console.log(`[Worker] Bắt đầu xử lý luận văn: ${thesisId}`);
  
  try {
    // Cập nhật trạng thái
    await Thesis.findByIdAndUpdate(thesisId, { status: 'processing' });
    
    // Thông báo tiến độ
    job.progress(10);
    
    // Lấy thông tin luận văn
    const thesis = await Thesis.findById(thesisId);
    if (!thesis) throw new Error('Không tìm thấy luận văn');
    
    job.progress(20);
    console.log(`[Worker] Đã tìm thấy luận văn: ${thesis.title}`);
    
    // Thực hiện kiểm tra đạo văn
    const results = await performPlagiarismCheck(thesis);
    
    job.progress(80);
    console.log(`[Worker] Đã hoàn thành kiểm tra đạo văn: ${thesis.title}`);
    
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
    
    job.progress(90);
    
    // Gửi email thông báo
    const emailSent = await sendPlagiarismCompletionEmail(userEmail, updatedThesis);
    console.log(`[Worker] Gửi email thông báo: ${emailSent ? 'Thành công' : 'Thất bại'}`);
    
    job.progress(100);
    
    return { success: true, message: 'Kiểm tra đạo văn hoàn tất', emailSent };
    
  } catch (error) {
    console.error(`[Worker] Lỗi khi xử lý luận văn ${thesisId}:`, error);
    
    // Cập nhật trạng thái lỗi
    await Thesis.findByIdAndUpdate(thesisId, { 
      status: 'error',
      errorMessage: error.message || 'Lỗi không xác định'
    });
    
    throw error;
  }
});

// Xử lý các sự kiện của queue
plagiarismQueue.on('completed', (job, result) => {
  console.log(`[Worker] Job ${job.id} hoàn thành với kết quả:`, result);
});

plagiarismQueue.on('failed', (job, error) => {
  console.error(`[Worker] Job ${job.id} thất bại với lỗi:`, error);
});

plagiarismQueue.on('stalled', (job) => {
  console.warn(`[Worker] Job ${job.id} bị treo`);
});

plagiarismQueue.on('progress', (job, progress) => {
  console.log(`[Worker] Job ${job.id} tiến độ: ${progress}%`);
});

console.log('[Worker] Plagiarism worker đã khởi động và đang lắng nghe công việc');

module.exports = { plagiarismQueue };
