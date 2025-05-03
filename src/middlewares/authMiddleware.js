const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware cho phép truy cập công khai (không cần xác thực)
const publicRoute = (req, res, next) => {
  // Gán một ID người dùng mặc định cho các route công khai
  req.user = {
    _id: '65f5533aeb952d729e2baf1d', // ID mặc định cho admin
    isAdmin: true
  };
  next();
};

// Middleware bảo vệ route, yêu cầu user đăng nhập
const protect = async (req, res, next) => {
  let token;

  try {
    // Kiểm tra header authorization bắt đầu với Bearer
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // Kiểm tra token trong cookies (nếu có)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      // Kiểm tra xem đây có phải là route đặc biệt (ví dụ: tải xuống báo cáo)
      if (req.originalUrl.includes('/api/theses/report/')) {
        console.log('Cho phép truy cập báo cáo đặc biệt mà không cần xác thực');
        return next();
      }
      
      return res.status(401).json({
        success: false, 
        message: 'Không được phép truy cập, không tìm thấy token. Vui lòng đăng nhập lại.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tìm user từ id trong token và trả về thông tin user 
    // (không bao gồm password)
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy người dùng với token này. Tài khoản có thể đã bị xóa.'
      });
    }

    // Lưu thông tin user vào request
    req.user = user;
    next();
  } catch (error) {
    console.error('Lỗi xác thực:', error.message);
    
    // Xử lý các loại lỗi JWT khác nhau
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
        errorType: 'TOKEN_EXPIRED'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token không hợp lệ, vui lòng đăng nhập lại',
        errorType: 'INVALID_TOKEN'
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Lỗi xác thực: ' + error.message,
        errorType: 'AUTH_ERROR'
      });
    }
  }
};

// Middleware kiểm tra quyền admin
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Không được phép truy cập, yêu cầu quyền quản trị viên'
    });
  }
};

// Middleware cho route có thể truy cập mà không cần xác thực
// nhưng vẫn sẽ sử dụng thông tin người dùng nếu có
const optionalAuth = async (req, res, next) => {
  let token;

  try {
    // Kiểm tra header authorization bắt đầu với Bearer
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // Kiểm tra token trong cookies (nếu có)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      // Cho phép tiếp tục mà không cần xác thực
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tìm user từ id trong token và trả về thông tin user 
    req.user = await User.findById(decoded.id).select('-password');
  } catch (error) {
    // Nếu token không hợp lệ, vẫn cho phép tiếp tục mà không cần xác thực
    console.log('Token không hợp lệ trong optionalAuth, tiếp tục xử lý');
  } finally {
    // Luôn tiếp tục xử lý dù có lỗi hay không
    next();
  }
};

module.exports = { protect, admin, publicRoute, optionalAuth };
