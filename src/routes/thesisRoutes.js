const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { 
  getAllTheses, 
  getThesisById, 
  deleteThesis, 
  uploadThesis, 
  getMyTheses,
  recheckThesis,
  getThesisFile,
  downloadPlagiarismReport,
  downloadThesis,
  updateThesisStatus,
  getThesisStatistics
} = require('../controllers/thesisController');

// Sử dụng StorageManager để upload file sử dụng Backblaze B2
const { handleUpload } = require('../utils/storageManager');

// Tuyến đường public
router.get('/file/:objectName', protect, getThesisFile);
router.get('/download/:id', protect, downloadThesis);
router.get('/report/:id/:type', protect, downloadPlagiarismReport);

// Tuyến đường cần bảo vệ với JWT
// Đã sửa: getMyTheses thay vì getAllTheses cho người dùng thông thường
router.route('/')
  .get(protect, getMyTheses)  // Thay đổi từ (protect, admin, getAllTheses) thành (protect, getMyTheses)
  .post(protect, handleUpload('file'), uploadThesis);

// Tuyến đường chỉ cho admin
router.route('/admin/all')
  .get(protect, admin, getAllTheses);  // Chuyển getAllTheses vào route riêng cho admin

router.route('/upload')
  .post(protect, handleUpload('file'), uploadThesis);

router.route('/my')
  .get(protect, getMyTheses);

router.route('/stats')
  .get(protect, getThesisStatistics);

router.route('/recheck/:id')
  .post(protect, recheckThesis);

// QUAN TRỌNG: Route với tham số (/:id) phải đặt sau các route cụ thể
router.route('/:id')
  .get(protect, getThesisById)
  .put(protect, updateThesisStatus)
  .delete(protect, deleteThesis);

module.exports = router;
