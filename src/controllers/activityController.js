const Activity = require('../models/Activity');

// @desc    Lấy các hoạt động gần đây (cho admin: tất cả, cho user: chỉ của họ và các hoạt động public)
// @route   GET /api/activities
// @access  Private
const getActivities = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const isAdmin = req.user.isAdmin;
    
    let query = {};
    
    // Nếu không phải admin, chỉ hiển thị hoạt động của người dùng và hoạt động public
    if (!isAdmin) {
      query = {
        $or: [
          { user: req.user._id },
          { isPublic: true }
        ]
      };
    }
    
    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('user', 'name');
    
    res.json(activities);
  } catch (error) {
    console.error('Lỗi khi lấy hoạt động:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy hoạt động',
      error: error.message,
    });
  }
};

// Helper function để lưu hoạt động trong hệ thống (không phải REST endpoint)
const logActivity = async (userId, action, description, entityType = 'system', entityId = null, metadata = {}, isPublic = false) => {
  try {
    const activity = await Activity.create({
      user: userId,
      action,
      description,
      entityType,
      entityId,
      metadata,
      isPublic
    });
    return activity;
  } catch (error) {
    console.error('Lỗi khi lưu hoạt động:', error);
    return null;
  }
};

// @desc    Tạo hoạt động mẫu cho testing
// @route   POST /api/activities/seed
// @access  Private/Admin hoặc Public (tùy route)
const seedActivities = async (req, res) => {
  try {
    // Kiểm tra nếu có thông tin người dùng và không phải là admin
    if (req.user && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này' });
    }

    // Xóa tất cả hoạt động hiện có
    await Activity.deleteMany({});

    // Sử dụng ID mặc định nếu không có thông tin người dùng
    const userId = req.user ? req.user._id : '65f5533aeb952d729e2baf1d'; // ID mặc định cho admin
    
    // Tạo dữ liệu mẫu
    const sampleActivities = [
      {
        user: userId,
        action: 'Tải lên luận văn mới',
        description: 'Luận văn về trí tuệ nhân tạo đã được tải lên',
        entityType: 'thesis',
        isPublic: true,
        createdAt: new Date()
      },
      {
        user: userId,
        action: 'Đăng ký người dùng mới',
        description: 'Giảng viên mới đã tham gia hệ thống',
        entityType: 'user',
        isPublic: true,
        createdAt: new Date(Date.now() - 86400000) // 1 ngày trước
      },
      {
        user: userId,
        action: 'Kiểm tra đạo văn hoàn tất',
        description: 'Kết quả: 15% nội dung trùng lặp',
        entityType: 'thesis',
        isPublic: true,
        createdAt: new Date(Date.now() - 172800000) // 2 ngày trước
      },
      {
        user: userId,
        action: 'Cấu hình hệ thống',
        description: 'Cập nhật cấu hình hệ thống kiểm tra đạo văn',
        entityType: 'system',
        isPublic: true,
        createdAt: new Date(Date.now() - 259200000) // 3 ngày trước
      },
      {
        user: userId,
        action: 'Xóa luận văn',
        description: 'Đã xóa luận văn không hợp lệ',
        entityType: 'thesis',
        isPublic: true,
        createdAt: new Date(Date.now() - 345600000) // 4 ngày trước
      },
      {
        user: userId,
        action: 'Cập nhật quyền người dùng',
        description: 'Đã cấp quyền quản trị viên cho người dùng',
        entityType: 'user',
        isPublic: true,
        createdAt: new Date(Date.now() - 432000000) // 5 ngày trước
      },
      {
        user: userId,
        action: 'Cập nhật cấu hình AI',
        description: 'Đã thay đổi ngưỡng phát hiện đạo văn AI thành 30%',
        entityType: 'system',
        isPublic: true,
        createdAt: new Date(Date.now() - 518400000) // 6 ngày trước
      }
    ];

    // Lưu tất cả các hoạt động mẫu
    await Activity.insertMany(sampleActivities);

    res.status(201).json({ 
      message: 'Đã tạo dữ liệu mẫu cho hoạt động thành công', 
      count: sampleActivities.length 
    });
  } catch (error) {
    console.error('Lỗi khi tạo dữ liệu mẫu cho hoạt động:', error);
    res.status(500).json({
      message: 'Lỗi khi tạo dữ liệu mẫu cho hoạt động',
      error: error.message,
    });
  }
};

module.exports = {
  getActivities,
  logActivity,
  seedActivities,
};
