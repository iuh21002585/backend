const { logActivity } = require('../controllers/activityController');

/**
 * Middleware để ghi lại hoạt động của người dùng
 * @param {string} action - Loại hành động
 * @param {function} getDescription - Hàm để lấy mô tả từ request
 * @param {string} entityType - Loại đối tượng liên quan
 * @param {function} getEntityId - Hàm để lấy ID đối tượng từ request
 * @param {boolean} isPublic - Hoạt động có phải public không
 */
const logActivityMiddleware = (action, getDescription, entityType = 'system', getEntityId = null, isPublic = true) => {
  return async (req, res, next) => {
    // Lưu response ban đầu
    const originalSend = res.send;
    
    // Override phương thức send
    res.send = function(body) {
      try {
        // Chỉ log khi yêu cầu thành công
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const userId = req.user?._id;
          
          if (userId) {
            const description = typeof getDescription === 'function' ? getDescription(req, res, body) : getDescription;
            const entityId = getEntityId ? getEntityId(req) : null;
            
            // Log hoạt động bất đồng bộ
            logActivity(
              userId,
              action,
              description,
              entityType,
              entityId,
              { method: req.method, path: req.originalUrl },
              isPublic
            ).catch(err => console.error('Lỗi khi log hoạt động:', err));
          }
        }
      } catch (error) {
        console.error('Lỗi trong middleware ghi log:', error);
      }
      
      // Gọi method gốc
      return originalSend.call(this, body);
    };
    
    next();
  };
};

module.exports = {
  logActivityMiddleware
};
