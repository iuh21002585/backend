const Notification = require('../models/Notification');

// @desc    Lấy tất cả thông báo của người dùng hiện tại
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json(notifications);
  } catch (error) {
    console.error('Lỗi khi lấy thông báo:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy thông báo',
      error: error.message,
    });
  }
};

// @desc    Đánh dấu thông báo đã đọc
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    notification.isRead = true;
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error('Lỗi khi đánh dấu đã đọc:', error);
    res.status(500).json({
      message: 'Lỗi khi đánh dấu đã đọc',
      error: error.message,
    });
  }
};

// @desc    Đánh dấu tất cả thông báo đã đọc
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );

    res.json({ message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
  } catch (error) {
    console.error('Lỗi khi đánh dấu tất cả đã đọc:', error);
    res.status(500).json({
      message: 'Lỗi khi đánh dấu tất cả đã đọc',
      error: error.message,
    });
  }
};

// @desc    Tạo thông báo mới (chủ yếu sử dụng từ bên trong API)
// @route   POST /api/notifications
// @access  Private/Admin
const createNotification = async (req, res) => {
  try {
    const { userId, title, message, type, link } = req.body;
    
    // Chỉ admin mới có thể tạo thông báo cho người dùng khác
    if (userId !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Không có quyền thực hiện hành động này' });
    }

    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type: type || 'info',
      link: link || '',
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Lỗi khi tạo thông báo:', error);
    res.status(500).json({
      message: 'Lỗi khi tạo thông báo',
      error: error.message,
    });
  }
};

// Helper function cho internal notification (không phải REST endpoint)
const createSystemNotification = async (userId, title, message, type = 'info', link = '') => {
  try {
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      link,
    });
    return notification;
  } catch (error) {
    console.error('Lỗi khi tạo thông báo hệ thống:', error);
    return null;
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  createNotification,
  createSystemNotification,
};
