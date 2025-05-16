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
    const [thesisStats, notificationStats] = await Promise.all([
      thesisQueue.getJobCounts(),
      notificationQueue.getJobCounts()
    ]);
    
    res.json({
      thesis: thesisStats,
      notification: notificationStats
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
    const pendingJobs = await thesisQueue.getWaiting();
    res.json(pendingJobs.map(job => ({
      id: job.id,
      thesisId: job.data.thesisId,
      userId: job.data.userId,
      timestamp: job.timestamp,
      attempts: job.attemptsMade
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
    const failedJobs = await thesisQueue.getFailed();
    res.json(failedJobs.map(job => ({
      id: job.id,
      thesisId: job.data.thesisId,
      userId: job.data.userId,
      timestamp: job.timestamp,
      attempts: job.attemptsMade,
      failedReason: job.failedReason
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
    const job = await thesisQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ message: 'Không tìm thấy công việc' });
    }
    
    await job.retry();
    res.json({ message: 'Đã thêm công việc vào hàng đợi lại', jobId });
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
    const job = await thesisQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ message: 'Không tìm thấy công việc' });
    }
    
    await job.remove();
    res.json({ message: 'Đã xóa công việc khỏi hàng đợi', jobId });
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
    const job = await thesisQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ message: 'Không tìm thấy công việc' });
    }
    
    res.json({
      id: job.id,
      data: job.data,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attempts: job.attemptsMade,
      state: await job.getState(),
      failedReason: job.failedReason
    });
  } catch (error) {
    console.error(`Error getting job ${req.params.id}:`, error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết công việc', error: error.message });
  }
});

module.exports = router;