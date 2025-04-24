const express = require('express');
const { 
  getNotifications,
  markAsRead,
  markAllAsRead,
  createNotification
} = require('../controllers/notificationController');
const { protect, admin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Lấy thông báo của người dùng
router.route('/').get(protect, getNotifications);

// Tạo thông báo mới (chỉ admin)
router.route('/').post(protect, admin, createNotification);

// Đánh dấu thông báo đã đọc
router.route('/:id/read').put(protect, markAsRead);

// Đánh dấu tất cả thông báo đã đọc
router.route('/read-all').put(protect, markAllAsRead);

module.exports = router;
