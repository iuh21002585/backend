const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// @desc    Đăng ký người dùng mới với xác nhận email
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, university, faculty } = req.body;

    // Kiểm tra các trường bắt buộc
    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Vui lòng cung cấp đầy đủ thông tin bắt buộc (tên, email, mật khẩu)'
      });
    }

    // Kiểm tra email đã tồn tại
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        message: 'Email đã được đăng ký'
      });
    }

    // Tạo người dùng mới
    const user = new User({
      name,
      email,
      password, // Password sẽ được hash trong pre-save hook trong model
      university: university || '',
      faculty: faculty || '',
      accountType: 'local',
      isEmailVerified: false
    });

    try {
      // Tạo token xác minh email
      const verificationToken = user.generateVerificationToken();
      
      // Lưu user với token xác minh
      await user.save();

      // Thử gửi email xác minh
      try {
        // Kiểm tra cấu hình email trước khi gửi
        const { validateEmailConfig } = require('../services/emailService');
        const emailConfigValid = validateEmailConfig();
        
        if (!emailConfigValid) {
          console.warn('Cấu hình email không hợp lệ. Email xác minh không được gửi.');
          // Vẫn đăng ký thành công nhưng thông báo lỗi email
          return res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            message: 'Đăng ký thành công! Lỗi gửi email xác minh, vui lòng liên hệ quản trị viên.',
            verificationRequired: true,
            emailError: true
          });
        }
        
        // Import function để gửi email xác minh
        const emailService = require('../services/emailService');
        const emailSent = await emailService.sendVerificationEmail(user, verificationToken);
        
        if (emailSent) {
          return res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.',
            verificationRequired: true
          });
        } else {
          return res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            message: 'Đăng ký thành công! Không thể gửi email xác nhận. Vui lòng liên hệ quản trị viên.',
            verificationRequired: true,
            emailError: true
          });
        }
      } catch (emailError) {
        console.error('Lỗi khi gửi email xác minh:', emailError);
        
        return res.status(201).json({
          _id: user._id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
          message: 'Đăng ký thành công! Không thể gửi email xác nhận. Vui lòng liên hệ quản trị viên.',
          verificationRequired: true,
          emailError: true
        });
      }
    } catch (saveError) {
      console.error('Lỗi khi lưu người dùng:', saveError);
      return res.status(500).json({
        message: 'Lỗi khi đăng ký người dùng',
        error: saveError.message,
      });
    }
  } catch (error) {
    console.error('Lỗi khi đăng ký người dùng:', error);
    return res.status(500).json({
      message: 'Lỗi khi đăng ký người dùng',
      error: error.message,
    });
  }
};

// @desc    Xác minh email người dùng
// @route   GET /api/users/verify-email
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email) {
      return res.status(400).json({
        message: 'Thông tin xác minh không hợp lệ'
      });
    }

    // Tìm người dùng với token và email
    const user = await User.findOne({
      email,
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Token xác minh không hợp lệ hoặc đã hết hạn'
      });
    }

    // Xác nhận email và xóa token
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    
    await user.save();

    return res.json({
      message: 'Xác minh email thành công! Bạn có thể đăng nhập ngay bây giờ.',
      verified: true
    });
  } catch (error) {
    console.error('Lỗi khi xác minh email:', error);
    return res.status(500).json({
      message: 'Lỗi khi xác minh email',
      error: error.message
    });
  }
};

// @desc    Gửi lại email xác minh
// @route   POST /api/users/resend-verification
// @access  Public
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        message: 'Email không được để trống'
      });
    }

    // Tìm người dùng theo email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: 'Không tìm thấy tài khoản với email này'
      });
    }

    // Kiểm tra nếu email đã xác minh
    if (user.isEmailVerified) {
      return res.status(400).json({
        message: 'Email này đã được xác minh'
      });
    }

    // Tạo token xác minh mới
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Gửi email xác minh
    const emailSent = await sendVerificationEmail(user, verificationToken);
    
    if (emailSent) {
      return res.json({
        message: 'Email xác minh đã được gửi lại. Vui lòng kiểm tra hộp thư của bạn.'
      });
    } else {
      return res.status(500).json({
        message: 'Không thể gửi email xác minh. Vui lòng thử lại sau.'
      });
    }
  } catch (error) {
    console.error('Lỗi khi gửi lại email xác minh:', error);
    return res.status(500).json({
      message: 'Lỗi khi gửi lại email xác minh',
      error: error.message
    });
  }
};

// @desc    Đăng nhập người dùng & lấy token
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!email || !password) {
      return res.status(400).json({
        message: 'Vui lòng cung cấp email và mật khẩu'
      });
    }

    // Tìm người dùng theo email
    const user = await User.findOne({ email: email.trim() });

    // Kiểm tra nếu user không tồn tại
    if (!user) {
      return res.status(401).json({
        message: 'Email hoặc mật khẩu không đúng'
      });
    }

    // Kiểm tra nếu tài khoản là Google và không có mật khẩu
    if (user.accountType === 'google' && !user.password) {
      return res.status(401).json({
        message: 'Tài khoản này sử dụng đăng nhập Google. Vui lòng đăng nhập bằng Google.',
        useGoogle: true
      });
    }

    // Kiểm tra nếu email chưa được xác minh
    if (!user.isEmailVerified && user.accountType === 'local') {
      return res.status(401).json({
        message: 'Email chưa được xác minh. Vui lòng kiểm tra email của bạn để xác minh tài khoản.',
        verificationRequired: true,
        email: user.email
      });
    }

    // Kiểm tra mật khẩu
    const passwordMatches = await user.matchPassword(password);

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Email hoặc mật khẩu không đúng'
      });
    }

    // Đăng nhập thành công
    // Cập nhật thời gian đăng nhập cuối
    user.lastLogin = Date.now();
    await user.save();
    
    // Ghi lại hoạt động đăng nhập thành công
    try {
      const { logUserActivity } = require('../utils/logActivityHelper');
      await logUserActivity(
        user,
        'Đăng nhập',
        `${user.name} đã đăng nhập vào hệ thống`,
        'user',
        user._id.toString(),
        false // Hoạt động đăng nhập là private
      );
    } catch (logError) {
      console.error('Không thể ghi lại hoạt động đăng nhập:', logError);
      // Tiếp tục đăng nhập ngay cả khi ghi log thất bại
    }

    // Trả về thông tin người dùng và token
    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      university: user.university,
      faculty: user.faculty,
      profilePicture: user.profilePicture,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Lỗi khi đăng nhập:', error);
    return res.status(500).json({
      message: 'Lỗi máy chủ nội bộ',
      error: error.message,
    });
  }
};

// @desc    Yêu cầu đặt lại mật khẩu
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        message: 'Email không được để trống'
      });
    }

    // Tìm người dùng theo email
    const user = await User.findOne({ email });

    if (!user) {
      // Không tiết lộ nếu email tồn tại trong hệ thống vì lý do bảo mật
      return res.json({
        message: 'Nếu email này tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.'
      });
    }

    // Không cho phép đặt lại mật khẩu cho tài khoản Google mà không có mật khẩu
    if (user.accountType === 'google' && !user.password) {
      return res.status(400).json({
        message: 'Tài khoản này sử dụng đăng nhập Google. Vui lòng đăng nhập bằng Google.',
        useGoogle: true
      });
    }

    // Tạo token đặt lại mật khẩu
    const resetToken = user.generateResetPasswordToken();
    await user.save();

    // Gửi email đặt lại mật khẩu
    const emailSent = await sendPasswordResetEmail(user, resetToken);
    
    if (emailSent) {
      return res.json({
        message: 'Email hướng dẫn đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư của bạn.'
      });
    } else {
      // Xóa token nếu không gửi được email
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      
      return res.status(500).json({
        message: 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.'
      });
    }
  } catch (error) {
    console.error('Lỗi khi yêu cầu đặt lại mật khẩu:', error);
    return res.status(500).json({
      message: 'Lỗi khi yêu cầu đặt lại mật khẩu',
      error: error.message
    });
  }
};

// @desc    Đặt lại mật khẩu với token
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body;
    
    if (!token || !email || !password) {
      return res.status(400).json({
        message: 'Thông tin đặt lại mật khẩu không hợp lệ'
      });
    }

    // Tìm người dùng với token và email
    const user = await User.findOne({
      email,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'
      });
    }

    // Đặt mật khẩu mới
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    // Nếu người dùng chưa xác minh email, đánh dấu là đã xác minh
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
    }
    
    await user.save();

    return res.json({
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay bây giờ.'
    });
  } catch (error) {
    console.error('Lỗi khi đặt lại mật khẩu:', error);
    return res.status(500).json({
      message: 'Lỗi khi đặt lại mật khẩu',
      error: error.message
    });
  }
};

// @desc    Auth với Google (khởi tạo flow Passport)
// @route   GET /api/users/google
// @access  Public
const googleAuth = (req, res) => {
  // Xử lý bởi middleware Passport.js
  // Chuyển hướng tới Google OAuth
};

// @desc    Callback từ Google OAuth
// @route   GET /api/users/google/callback
// @access  Public
const googleCallback = (req, res) => {
  // Xác thực thành công bởi Passport.js, tạo JWT
  try {
    console.log('Google OAuth callback received');
    
    // req.user được thiết lập bởi Passport
    if (!req.user) {
      console.error('Google OAuth callback: No user data received');
      const frontendURL = process.env.FRONTEND_URL || 'https://iuh-plagcheck.onrender.com';
      return res.status(401).redirect(`${frontendURL}/login?error=google_auth_failed`);
    }
    
    console.log(`Google OAuth successful for user: ${req.user.email}`);
    
    // Tạo JWT token
    const token = generateToken(req.user._id);
    
    // Đảm bảo luôn sử dụng URL frontend từ biến môi trường
    const frontendURL = process.env.FRONTEND_URL || 'https://iuh-plagcheck.onrender.com';
    console.log(`Redirecting to frontend URL: ${frontendURL}/auth-success`);
    
    // Chuyển hướng về frontend với token và thông tin người dùng
    return res.redirect(`${frontendURL}/auth-success?token=${token}&userId=${req.user._id}`);
  } catch (error) {
    console.error('Lỗi trong Google callback:', error);
    
    const frontendURL = process.env.FRONTEND_URL || 'https://iuh-plagcheck.onrender.com';
    return res.redirect(`${frontendURL}/login?error=server_error`);
  }
};

// @desc    Liên kết tài khoản với Google
// @route   POST /api/users/link-google
// @access  Private
const linkGoogleAccount = async (req, res) => {
  try {
    // Lấy thông tin người dùng từ Google sau khi đã xác thực
    const { googleId, googleEmail, profilePicture } = req.body;
    
    if (!googleId || !googleEmail) {
      return res.status(400).json({
        message: 'Thông tin liên kết Google không đầy đủ'
      });
    }
    
    // Kiểm tra xem googleId đã được sử dụng bởi tài khoản khác chưa
    const existingGoogleUser = await User.findOne({ googleId });
    if (existingGoogleUser && existingGoogleUser._id.toString() !== req.user._id.toString()) {
      return res.status(400).json({
        message: 'Tài khoản Google này đã được liên kết với tài khoản khác'
      });
    }
    
    // Lấy thông tin người dùng hiện tại
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        message: 'Không tìm thấy người dùng'
      });
    }
    
    // Cập nhật thông tin Google
    user.googleId = googleId;
    user.isEmailVerified = true; // Đánh dấu email đã xác minh
    
    // Cập nhật ảnh đại diện nếu người dùng chưa có
    if (!user.profilePicture && profilePicture) {
      user.profilePicture = profilePicture;
    }
    
    await user.save();
    
    return res.json({
      message: 'Liên kết tài khoản Google thành công',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    console.error('Lỗi khi liên kết tài khoản Google:', error);
    return res.status(500).json({
      message: 'Lỗi khi liên kết tài khoản Google',
      error: error.message
    });
  }
};

// @desc    Hủy liên kết tài khoản Google
// @route   POST /api/users/unlink-google
// @access  Private
const unlinkGoogleAccount = async (req, res) => {
  try {
    // Lấy thông tin người dùng hiện tại
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        message: 'Không tìm thấy người dùng'
      });
    }
    
    // Kiểm tra nếu người dùng không có mật khẩu
    if (!user.password) {
      return res.status(400).json({
        message: 'Bạn cần thiết lập mật khẩu trước khi hủy liên kết với Google'
      });
    }
    
    // Hủy liên kết Google
    user.googleId = undefined;
    user.accountType = 'local';
    
    await user.save();
    
    return res.json({
      message: 'Hủy liên kết tài khoản Google thành công',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Lỗi khi hủy liên kết tài khoản Google:', error);
    return res.status(500).json({
      message: 'Lỗi khi hủy liên kết tài khoản Google',
      error: error.message
    });
  }
};

// @desc    Lấy thông tin người dùng
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        university: user.university,
        faculty: user.faculty,
        isAdmin: user.isAdmin,
      });
    } else {
      res.status(404);
      throw new Error('Không tìm thấy người dùng');
    }
  } catch (error) {
    console.error('Lỗi khi lấy thông tin người dùng:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy thông tin người dùng',
      error: error.message,
    });
  }
};

// @desc    Cập nhật thông tin người dùng
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.university = req.body.university !== undefined ? req.body.university : user.university;
      user.faculty = req.body.faculty !== undefined ? req.body.faculty : user.faculty;

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        university: updatedUser.university,
        faculty: updatedUser.faculty,
        isAdmin: updatedUser.isAdmin,
        token: generateToken(updatedUser._id),
      });
    } else {
      res.status(404);
      throw new Error('Không tìm thấy người dùng');
    }
  } catch (error) {
    console.error('Lỗi khi cập nhật thông tin người dùng:', error);
    res.status(500).json({
      message: 'Lỗi khi cập nhật thông tin người dùng',
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách tất cả người dùng
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const Thesis = require('../models/Thesis');
    
    // Lấy danh sách người dùng
    const users = await User.find({}).select('-password');
    
    // Tính toán số lượng luận văn cho mỗi người dùng
    const usersWithThesesCount = await Promise.all(
      users.map(async (user) => {
        const thesesCount = await Thesis.countDocuments({ user: user._id });
        return {
          ...user.toObject(),
          thesesCount
        };
      })
    );
    
    res.json(usersWithThesesCount);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách người dùng:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy danh sách người dùng',
      error: error.message,
    });
  }
};

// @desc    Lấy thông tin người dùng theo ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
    console.error('Lỗi khi lấy thông tin người dùng:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy thông tin người dùng',
      error: error.message,
    });
  }
};

// @desc    Cập nhật người dùng
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const { name, email, isAdmin, password } = req.body;

    user.name = name || user.name;
    user.email = email || user.email;

    // Chỉ cập nhật trường isAdmin nếu được cung cấp
    if (isAdmin !== undefined) {
      user.isAdmin = isAdmin;
    }

    // Chỉ cập nhật mật khẩu nếu được cung cấp
    if (password) {
      user.password = password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      message: 'Đã cập nhật thông tin người dùng',
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật người dùng:', error);
    res.status(500).json({
      message: 'Lỗi khi cập nhật người dùng',
      error: error.message,
    });
  }
};

// @desc    Xóa người dùng
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      // Kiểm tra nếu người dùng đang xóa chính họ
      if (user._id.toString() === req.user._id.toString()) {
        return res.status(400).json({ message: 'Không thể xóa tài khoản của chính bạn' });
      }

      await user.deleteOne();
      res.json({ message: 'Người dùng đã bị xóa' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
    console.error('Lỗi khi xóa người dùng:', error);
    res.status(500).json({
      message: 'Lỗi khi xóa người dùng',
      error: error.message,
    });
  }
};

// @desc    Tạo người dùng mới (chỉ dành cho admin)
// @route   POST /api/users/admin
// @access  Private/Admin
const createUserByAdmin = async (req, res) => {
  try {
    const { name, email, password, isAdmin } = req.body;

    // Kiểm tra email đã tồn tại
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'Email đã được đăng ký' });
    }

    // Tạo người dùng mới
    const user = await User.create({
      name,
      email,
      password,
      isAdmin: isAdmin || false,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        message: 'Đã tạo người dùng mới',
      });
    } else {
      res.status(400).json({ message: 'Dữ liệu người dùng không hợp lệ' });
    }
  } catch (error) {
    console.error('Lỗi khi tạo người dùng mới:', error);
    res.status(500).json({
      message: 'Lỗi khi tạo người dùng mới',
      error: error.message,
    });
  }
};

// @desc    Đặt lại mật khẩu người dùng
// @route   POST /api/users/reset-passwords
// @access  Private/Admin
const resetPasswords = async (req, res) => {
  try {
    // Tìm tất cả người dùng
    const users = await User.find({});

    // Đặt lại mật khẩu cho mỗi người dùng
    for (const user of users) {
      user.password = '123456'; // Mật khẩu mặc định
      await user.save(); // Middleware pre-save sẽ mã hóa mật khẩu
    }

    res.json({ message: `Đã đặt lại mật khẩu cho ${users.length} người dùng` });
  } catch (error) {
    console.error('Lỗi khi đặt lại mật khẩu:', error);
    res.status(500).json({
      message: 'Lỗi khi đặt lại mật khẩu',
      error: error.message,
    });
  }
};

// @desc    Đặt lại mật khẩu người dùng (không cần xác thực - CHỈ DÙNG CHO DEBUG)
// @route   POST /api/users/reset-passwords-public
// @access  Public
const resetPasswordsPublic = async (req, res) => {
  try {
    const secretKey = req.body.secretKey;

    // Kiểm tra key bảo mật cơ bản để tránh truy cập trái phép
    if (secretKey !== 'fix_passwords_now') {
      res.status(401);
      throw new Error('Không được phép truy cập');
    }

    // Tìm tất cả người dùng
    const users = await User.find({});

    // Đặt lại mật khẩu cho mỗi người dùng
    for (const user of users) {
      user.password = '123456'; // Mật khẩu mặc định
      await user.save(); // Middleware pre-save sẽ mã hóa mật khẩu
    }

    res.json({ message: `Đã đặt lại mật khẩu cho ${users.length} người dùng` });
  } catch (error) {
    console.error('Lỗi khi đặt lại mật khẩu:', error);
    res.status(500).json({
      message: 'Lỗi khi đặt lại mật khẩu',
      error: error.message,
    });
  }
};

// @desc    Kiểm tra vấn đề đăng nhập
// @route   POST /api/users/check-login-issue
// @access  Public
const checkLoginIssue = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Tìm người dùng theo email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: 'Không tìm thấy người dùng với email này',
        emailExists: false,
      });
    }

    // Kiểm tra thông tin mật khẩu
    const passwordMatch = await user.matchPassword(password);
    const rawPasswordMatch = user.password === password;
    
    // Nếu mật khẩu khớp với plain text nhưng không khớp với bcrypt, cập nhật thành dạng đã băm
    if (rawPasswordMatch && !passwordMatch) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      await user.save();
      console.log(`Đã cập nhật mật khẩu cho người dùng ${user.email} thành dạng đã băm`);
    }

    res.json({
      message: 'Thông tin kiểm tra đăng nhập',
      user: {
        id: user._id,
        email: user.email,
        passwordHashed: user.password !== password,
        passwordMatch: passwordMatch,
        rawPasswordMatch: rawPasswordMatch,
        actualStoredPassword: user.password,
        needsUpdate: rawPasswordMatch && !passwordMatch,
      },
    });
  } catch (error) {
    console.error('Lỗi khi kiểm tra đăng nhập:', error);
    res.status(500).json({
      message: 'Lỗi khi kiểm tra đăng nhập',
      error: error.message,
    });
  }
};

// @desc    Lấy thống kê cho admin
// @route   GET /api/users/admin/stats
// @access  Private/Admin
const getAdminStats = async (req, res) => {
  try {
    // Đếm tất cả người dùng
    const totalUsers = await User.countDocuments({});
    
    return res.json({
      totalUsers
    });
  } catch (error) {
    console.error('Lỗi khi lấy thống kê admin:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

module.exports = {
  registerUser,
  verifyEmail,
  resendVerificationEmail,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  googleAuth,
  googleCallback,
  linkGoogleAccount,
  unlinkGoogleAccount,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  createUserByAdmin,
  resetPasswords,
  resetPasswordsPublic,
  checkLoginIssue,
  getAdminStats,
};
