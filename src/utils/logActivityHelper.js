const { logActivity } = require('../controllers/activityController');

/**
 * Hàm tiện ích để ghi lại hoạt động từ bất kỳ đâu trong mã
 * @param {Object} user - Đối tượng người dùng (có chứa _id)
 * @param {string} action - Loại hành động
 * @param {string} description - Mô tả hoạt động
 * @param {string} entityType - Loại đối tượng liên quan
 * @param {string|null} entityId - ID của đối tượng liên quan
 * @param {boolean} isPublic - Hoạt động có công khai không
 */
const logUserActivity = async (user, action, description, entityType = 'system', entityId = null, isPublic = true) => {
  if (!user || !user._id) {
    console.warn('Không thể ghi lại hoạt động: Thiếu thông tin người dùng');
    return;
  }

  try {
    await logActivity(
      user._id,
      action,
      description,
      entityType,
      entityId,
      null, // metadata
      isPublic
    );
  } catch (error) {
    console.error('Lỗi khi ghi lại hoạt động:', error);
  }
};

module.exports = {
  logUserActivity
};
