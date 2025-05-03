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
  updateThesisStatus
} = require('../controllers/thesisController');

// Sử dụng StorageManager để hỗ trợ cả MinIO và Backblaze B2
const { handleUpload } = require('../utils/storageManager');

// Tuyến đường public
router.get('/file/:objectName', protect, getThesisFile);
router.get('/download/:id', protect, downloadThesis);
router.get('/report/:id/:type', protect, downloadPlagiarismReport);

// Tuyến đường cần bảo vệ với JWT
router.route('/')
  .get(protect, admin, getAllTheses)
  .post(protect, handleUpload('file'), uploadThesis);

router.route('/upload')
  .post(protect, handleUpload('file'), uploadThesis);

router.route('/my')
  .get(protect, getMyTheses);

router.route('/recheck/:id')
  .post(protect, recheckThesis);

router.route('/:id')
  .get(protect, getThesisById)
  .put(protect, updateThesisStatus)
  .delete(protect, deleteThesis);

module.exports = router;
