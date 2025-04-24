const express = require('express');
const { getActivities, seedActivities } = require('../controllers/activityController');
const { protect, admin, publicRoute } = require('../middlewares/authMiddleware');

const router = express.Router();

// Lấy hoạt động gần đây
router.route('/').get(protect, getActivities);

// Tạo dữ liệu mẫu cho hoạt động (chỉ dành cho admin)
router.route('/seed').post(protect, admin, seedActivities);

// Tạo dữ liệu mẫu cho hoạt động (public - chỉ dùng cho development)
router.route('/seed-public').post(publicRoute, seedActivities);

module.exports = router;
