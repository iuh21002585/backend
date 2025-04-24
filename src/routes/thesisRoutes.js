const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  uploadThesis,
  getMyTheses,
  getThesisById,
  getThesisFile,
  downloadThesis,
  deleteThesis,
  getAllTheses,
  updateThesisStatus,
  updatePlagiarismScore,
  getThesisStatistics,
  recheckThesis, 
  downloadPlagiarismReport,
} = require('../controllers/thesisController');
const { protect, admin, optionalAuth } = require('../middlewares/authMiddleware');
const { handleUpload } = require('../utils/minioUploader');
const { logActivityMiddleware } = require('../middlewares/loggingMiddleware');

// Routes cho thống kê
router.route('/stats')
  .get(protect, getThesisStatistics);

// Route cho việc kiểm tra lại đạo văn
router.route('/:id/recheck')
  .post(
    protect,
    recheckThesis,
    logActivityMiddleware(
      'Kiểm tra lại đạo văn',
      (req) => `Đã kiểm tra lại đạo văn cho luận văn có ID: ${req.params.id}`,
      'thesis',
      (req) => req.params.id
    )
  );

// Routes cho người dùng đã đăng nhập
router.route('/')
  .get(protect, getMyTheses)
  .post(
    protect,
    handleUpload('file'),
    uploadThesis,
    logActivityMiddleware(
      'Tải lên luận văn mới',
      (req) => `Đã tải lên luận văn: ${req.body.title || 'Không có tiêu đề'}`,
      'thesis',
      (req) => req.thesis?._id
    )
  );

router.route('/upload')
  .post(protect, handleUpload(), uploadThesis);

router.route('/file/:objectName')
  .get(protect, getThesisFile);

router.route('/download/:id')
  .get(protect, downloadThesis);

// Route đặc biệt cho tất cả luận văn (để tương thích với frontend)
router.route('/all')
  .get(protect, admin, getAllTheses);

router.route('/report/:id/:type')
  .get(
    optionalAuth,
    downloadPlagiarismReport,
    logActivityMiddleware(
      'Tải xuống báo cáo đạo văn',
      (req) => `Đã tải xuống báo cáo đạo văn ${req.params.type === 'ai' ? 'AI' : 'truyền thống'} cho luận văn có ID: ${req.params.id}`,
      'thesis',
      (req) => req.params.id
    )
  );

router.route('/:id')
  .get(protect, getThesisById)
  .delete(
    protect,
    deleteThesis,
    logActivityMiddleware(
      'Xóa luận văn',
      (req) => `Đã xóa luận văn có ID: ${req.params.id}`,
      'thesis',
      (req) => req.params.id
    )
  );

// Routes cho admin
router.route('/admin/theses')
  .get(protect, admin, getAllTheses);

router.route('/:id/status')
  .put(
    protect,
    admin,
    updateThesisStatus,
    logActivityMiddleware(
      'Cập nhật trạng thái luận văn',
      (req) => `Đã cập nhật trạng thái luận văn thành: ${req.body.status}`,
      'thesis',
      (req) => req.params.id
    )
  );

router.route('/:id/plagiarism')
  .put(protect, admin, updatePlagiarismScore);

module.exports = router;
