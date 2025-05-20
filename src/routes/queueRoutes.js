const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { thesisQueue, notificationQueue } = require('../queues');

/**
 * @desc    Lấy thống kê về các hàng đợi
 * @route   GET /api/queues/stats
 * @access  Admin
 */
router.get('/stats', protect, admin, async (req, res) => {
  try {
    // Lấy thông tin từ thesisProcessor
    const thesisProcessor = require('../services/thesisProcessor');
    const status = thesisProcessor.getStatus();
    
    // Tính số lượng luận văn theo trạng thái
    const Thesis = require('../models/Thesis');
    const pendingCount = await Thesis.countDocuments({ status: 'pending' });
    const processingCount = await Thesis.countDocuments({ status: 'processing' });
    const completedCount = await Thesis.countDocuments({ status: 'completed' });
    const failedCount = await Thesis.countDocuments({ status: 'error' });
    
    // Trả về định dạng tương thích với API cũ
    const thesisStats = {
      waiting: pendingCount,
      active: processingCount,
      completed: completedCount,
      failed: failedCount,
      delayed: 0
    };
    
    // Thống kê thông báo (đơn giản hóa vì không còn sử dụng Redis)
    const notificationStats = {
      waiting: 0,
      active: 0,
      completed: 0, 
      failed: 0,
      delayed: 0
    };
    
    res.json({
      thesis: thesisStats,
      notification: notificationStats,
      processorStatus: {
        currentlyProcessing: status.processingTheses,
        queueLength: status.queueLength
      }
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê hàng đợi', error: error.message });
  }
});

/**
 * @desc    Lấy danh sách các công việc đang chờ
 * @route   GET /api/queues/pending
 * @access  Admin
 */
router.get('/pending', protect, admin, async (req, res) => {
  try {
    // Thay thế bằng gọi thesisProcessor để lấy thông tin công việc đang chờ
    const thesisProcessor = require('../services/thesisProcessor');
    const status = thesisProcessor.getStatus();
    
    // Trả về dữ liệu trong định dạng tương thích
    res.json(status.pendingTheses.map(thesisId => ({
      id: `thesis-${thesisId}`,
      thesisId: thesisId,
      timestamp: new Date(),
      attempts: 0
    })));
  } catch (error) {
    console.error('Error fetching pending jobs:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách công việc đang chờ', error: error.message });
  }
});

/**
 * @desc    Lấy danh sách các công việc thất bại
 * @route   GET /api/queues/failed
 * @access  Admin
 */
router.get('/failed', protect, admin, async (req, res) => {
  try {
    // Thay thế bằng truy vấn trực tiếp vào MongoDB để lấy luận văn có trạng thái lỗi
    const Thesis = require('../models/Thesis');
    const failedTheses = await Thesis.find({ status: 'error' })
      .select('_id title user uploadedAt processingAttempts processingError')
      .sort({ uploadedAt: -1 })
      .limit(50);
    
    // Trả về dữ liệu trong định dạng tương thích
    res.json(failedTheses.map(thesis => ({
      id: `thesis-${thesis._id}`,
      thesisId: thesis._id.toString(),
      userId: thesis.user ? thesis.user.toString() : null,
      timestamp: thesis.uploadedAt,
      attempts: thesis.processingAttempts || 0,
      failedReason: thesis.processingError || 'Không xác định'
    })));
  } catch (error) {
    console.error('Error fetching failed jobs:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách công việc thất bại', error: error.message });
  }
});

/**
 * @desc    Thử lại một công việc thất bại
 * @route   POST /api/queues/retry/:id
 * @access  Admin
 */
router.post('/retry/:id', protect, admin, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Kiểm tra xem ID có phải là ID luận văn không
    let thesisId = jobId;
    if (jobId.startsWith('thesis-')) {
      thesisId = jobId.substring(7);
    }
    
    // Tìm luận văn trong cơ sở dữ liệu
    const Thesis = require('../models/Thesis');
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      return res.status(404).json({ message: 'Không tìm thấy luận văn' });
    }
    
    // Cập nhật trạng thái luận văn để thử lại
    thesis.status = 'queued';
    thesis.processingError = null;
    thesis.processingAttempts = (thesis.processingAttempts || 0) + 1;
    await thesis.save();
    
    // Thêm luận văn vào danh sách xử lý
    const thesisProcessor = require('../services/thesisProcessor');
    thesisProcessor.submitThesis(thesisId);
    
    res.json({ message: 'Đã thêm luận văn vào hàng đợi lại', thesisId });
  } catch (error) {
    console.error(`Error retrying job ${req.params.id}:`, error);
    res.status(500).json({ message: 'Lỗi khi thử lại công việc', error: error.message });
  }
});

/**
 * @desc    Xóa một công việc
 * @route   DELETE /api/queues/:id
 * @access  Admin
 */
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Kiểm tra xem ID có phải là ID luận văn không
    let thesisId = jobId;
    if (jobId.startsWith('thesis-')) {
      thesisId = jobId.substring(7);
    }
    
    // Tìm luận văn trong cơ sở dữ liệu
    const Thesis = require('../models/Thesis');
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      return res.status(404).json({ message: 'Không tìm thấy luận văn' });
    }
    
    // Cập nhật trạng thái luận văn thành cancelled nếu đang trong hàng đợi
    if (thesis.status === 'queued' || thesis.status === 'pending') {
      thesis.status = 'cancelled';
      thesis.processingError = 'Đã hủy bởi quản trị viên';
      await thesis.save();
    }
    
    // Thông báo cho thesisProcessor để hủy nếu đang xử lý
    const thesisProcessor = require('../services/thesisProcessor');
    thesisProcessor.cancelProcessing(thesisId);
    
    res.json({ message: 'Đã hủy xử lý luận văn', thesisId });
  } catch (error) {
    console.error(`Error removing job ${req.params.id}:`, error);
    res.status(500).json({ message: 'Lỗi khi xóa công việc', error: error.message });
  }
});

/**
 * @desc    Lấy chi tiết một công việc
 * @route   GET /api/queues/:id
 * @access  Admin
 */
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Kiểm tra xem ID có phải là ID luận văn không
    let thesisId = jobId;
    if (jobId.startsWith('thesis-')) {
      thesisId = jobId.substring(7);
    }
    
    // Tìm luận văn trong cơ sở dữ liệu
    const Thesis = require('../models/Thesis');
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      return res.status(404).json({ message: 'Không tìm thấy luận văn' });
    }
    
    // Lấy thông tin trạng thái xử lý từ thesisProcessor
    const thesisProcessor = require('../services/thesisProcessor');
    const processingStatus = thesisProcessor.getThesisProcessingStatus(thesisId);
    
    // Trả về thông tin theo định dạng tương thích với API cũ
    res.json({
      id: `thesis-${thesis._id}`,
      data: {
        thesisId: thesis._id.toString(),
        title: thesis.title,
        userId: thesis.user ? thesis.user.toString() : null
      },
      timestamp: thesis.uploadedAt,
      processedOn: thesis.processingStartedAt,
      finishedOn: thesis.processingCompletedAt,
      attempts: thesis.processingAttempts || 0,
      state: thesis.status,
      failedReason: thesis.processingError || null,
      processingStatus: processingStatus
    });
  } catch (error) {
    console.error(`Error getting job ${req.params.id}:`, error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết công việc', error: error.message });
  }
});

module.exports = router;