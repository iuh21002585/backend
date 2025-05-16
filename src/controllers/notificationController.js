const Notification = require('../models/Notification');

// @desc    Đánh dấu tất cả thông báo đã đọc
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    // Thêm timeout để tránh các request bị treo quá lâu
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout khi đánh dấu đã đọc'));
      }, 5000); // 5 giây timeout
    });
    
    const updatePromise = Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );
    
    // Race giữa timeout và truy vấn
    const result = await Promise.race([
      updatePromise,
      timeoutPromise
    ]);
    
    // Trả về kết quả thành công với số bản ghi đã cập nhật
    res.json({ 
      message: 'Đã đánh dấu tất cả thông báo là đã đọc',
      modifiedCount: result?.modifiedCount || 0
    });
  } catch (error) {
    console.error('Lỗi khi đánh dấu tất cả thông báo đã đọc:', error);
    
    if (error.message === 'Timeout khi đánh dấu đã đọc') {
      return res.status(408).json({
        message: 'Hết thời gian khi đánh dấu đã đọc',
        error: 'request_timeout',
      });
    }
    
    res.status(500).json({
      message: 'Lỗi khi đánh dấu tất cả thông báo đã đọc',
      error: error.message,
    });
  }
};

// @desc    Lấy thông báo của người dùng hiện tại
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    // Thêm timeout để tránh các request bị treo quá lâu
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout khi lấy thông báo'));
      }, 5000); // 5 giây timeout
    });
    
    const notificationsPromise = Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(15);
    
    // Race giữa timeout và truy vấn
    const notifications = await Promise.race([
      notificationsPromise,
      timeoutPromise
    ]);
    
    res.json(notifications);
  } catch (error) {
    console.error('Lỗi khi lấy thông báo:', error);
    
    if (error.message === 'Timeout khi lấy thông báo') {
      return res.status(408).json({
        message: 'Hết thời gian khi lấy thông báo',
        error: 'request_timeout'
      });
    }
    
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
    // Thêm timeout để tránh các request bị treo quá lâu
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout khi đánh dấu đã đọc'));
      }, 5000); // 5 giây timeout
    });
    
    const notificationPromise = Notification.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    // Race giữa timeout và truy vấn
    const notification = await Promise.race([
      notificationPromise,
      timeoutPromise
    ]);

    if (!notification) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    notification.isRead = true;
    
    // Thêm timeout cho operation lưu
    const savePromise = notification.save();
    const saveTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout khi lưu thông báo'));
      }, 5000); // 5 giây timeout
    });
    
    // Race giữa timeout và lưu
    const savedNotification = await Promise.race([
      savePromise,
      saveTimeoutPromise
    ]);

    res.json(savedNotification);
  } catch (error) {
    console.error('Lỗi khi đánh dấu đã đọc:', error);
    
    if (error.message === 'Timeout khi đánh dấu đã đọc' || error.message === 'Timeout khi lưu thông báo') {
      return res.status(408).json({
        message: 'Hết thời gian khi đánh dấu đã đọc',
        error: 'request_timeout',
      });
    }
    
    res.status(500).json({
      message: 'Lỗi khi đánh dấu đã đọc',
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
