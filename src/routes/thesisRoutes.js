const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { 
  getAllTheses, 
  getThesisById, 
  deleteThesis, 
  uploadThesis, 
  getMyTheses,
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
router.get('/admin/all', protect, admin, getAllTheses);

// Tuyến đường để xử lý và phân tích đạo văn thủ công
router.post('/process-pending', protect, admin, async (req, res) => {
  try {
    const { processPendingTheses } = require('../controllers/processPendingTheses');
    const count = await processPendingTheses();
    res.json({ success: true, message: `Đã xử lý ${count} luận văn đang chờ` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xử lý một luận văn cụ thể theo ID
router.post('/process/:id', protect, admin, async (req, res) => {
  try {
    const { processThesisById } = require('../controllers/processPendingTheses');
    const thesis = await processThesisById(req.params.id);
    res.json({ 
      success: true, 
      message: `Đã xử lý luận văn: ${thesis.title}`, 
      thesis
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.route('/admin/all')
  .get(protect, admin, getAllTheses);  // Chuyển getAllTheses vào route riêng cho admin

// Thêm route mới tương thích với frontend
router.route('/all')
  .get(protect, admin, getAllTheses);  // Thêm route duplicate để tương thích với frontend

router.route('/upload')
  .post(protect, handleUpload('file'), uploadThesis);

router.route('/my')
  .get(protect, getMyTheses);

router.route('/stats')
  .get(protect, getThesisStatistics);

// QUAN TRỌNG: Route với tham số (/:id) phải đặt sau các route cụ thể
router.route('/:id')
  .get(protect, getThesisById)
  .put(protect, updateThesisStatus)
  .delete(protect, deleteThesis);

module.exports = router;
