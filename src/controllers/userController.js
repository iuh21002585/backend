const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const bcrypt = require('bcryptjs');

// @desc    Đăng ký người dùng mới
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Kiểm tra email đã tồn tại
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        message: 'Email đã được đăng ký'
      });
    }

    // Tạo người dùng mới
    const user = await User.create({
      name,
      email,
      password,
    });

    if (user) {
      // Xác nhận mật khẩu đã được mã hóa
      const savedUser = await User.findById(user._id);
      if (savedUser.password === password) {
        console.log('Cảnh báo: Mật khẩu chưa được mã hóa. Mã hóa thủ công...');
        // Mã hóa thủ công
        const salt = await bcrypt.genSalt(10);
        savedUser.password = await bcrypt.hash(password, salt);
        await savedUser.save();
      }
      
      return res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
      });
    } else {
      return res.status(400).json({
        message: 'Dữ liệu người dùng không hợp lệ'
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

// @desc    Đăng nhập người dùng & lấy token
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Tìm người dùng theo email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: 'Email hoặc mật khẩu không đúng'
      });
    }

    // Kiểm tra mật khẩu
    let passwordMatches = false;
    
    try {
      // Kiểm tra mật khẩu đã mã hóa
      passwordMatches = await user.matchPassword(password);
    } catch (matchError) {
      console.error('Lỗi khi so khớp mật khẩu:', matchError);
    }
    
    // Nếu không khớp với mật khẩu đã băm, kiểm tra xem có khớp với mật khẩu plain text không
    if (!passwordMatches) {
      // Kiểm tra trực tiếp với plain text
      if (user.password === password) {
        console.log(`Người dùng ${email} có mật khẩu dạng plain text. Đang mã hóa...`);
        passwordMatches = true;
        
        try {
          // Cập nhật mật khẩu thành dạng đã băm
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(password, salt);
          await user.save();
          console.log(`Đã mã hóa mật khẩu cho người dùng ${email}`);
        } catch (hashError) {
          console.error('Lỗi khi mã hóa mật khẩu:', hashError);
          // Tiếp tục đăng nhập ngay cả khi không thể mã hóa mật khẩu
        }
      }
    }

    if (passwordMatches) {
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
      }

      return res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
      });
    } else {
      return res.status(401).json({
        message: 'Email hoặc mật khẩu không đúng'
      });
    }
  } catch (error) {
    console.error('Lỗi khi đăng nhập:', error);
    return res.status(500).json({
      message: 'Lỗi máy chủ nội bộ',
      error: error.message,
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
  loginUser,
  getUserProfile,
  updateUserProfile,
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
