const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên không được để trống'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email không được để trống'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/.+\@.+\..+/, 'Email không hợp lệ'],
    },
    password: {
      type: String,
      required: function() {
        // Password bắt buộc chỉ khi không phải đăng nhập qua Google
        return !this.googleId;
      },
      minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự'],
    },
    university: {
      type: String,
      trim: true,
      default: '',
    },
    faculty: {
      type: String,
      trim: true,
      default: '',
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    // Thêm các trường mới cho xác thực email
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    // Thêm các trường cho đăng nhập Google
    googleId: {
      type: String,
      default: null,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    accountType: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
  },
  {
    timestamps: true,
  }
);

// Mã hóa mật khẩu trước khi lưu
userSchema.pre('save', async function (next) {
  // Chỉ mã hóa mật khẩu nếu nó đã bị sửa đổi hoặc là tài liệu mới
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    // Kiểm tra xem mật khẩu đã được mã hóa chưa
    // Mật khẩu đã mã hóa sẽ có định dạng $2a$, $2b$, hoặc $2y$ 
    // (các tiền tố chuẩn của bcrypt)
    if (this.password && this.password.match(/^\$2[ayb]\$\d+\$/)) {
      console.log('Mật khẩu đã được mã hóa, bỏ qua bước mã hóa');
      return next();
    }
    
    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    console.error('Lỗi khi mã hóa mật khẩu:', error);
    next(error);
  }
});

// Phương thức so sánh mật khẩu
userSchema.methods.matchPassword = async function (enteredPassword) {
  try {
    // Bảo vệ khỏi trường hợp null/undefined
    if (!this.password || !enteredPassword) {
      console.log('Không có mật khẩu hoặc mật khẩu đầu vào trống');
      return false;
    }
    
    // Nếu đăng nhập qua Google và không có mật khẩu local
    if (this.googleId && !this.password) {
      console.log('Tài khoản Google không có mật khẩu local');
      return false;
    }
    
    // So sánh mật khẩu plain text
    const isPlainTextMatch = this.password === enteredPassword;
    if (isPlainTextMatch) {
      console.log('Mật khẩu khớp với plain text');
      return true;
    }
    
    // So sánh với bcrypt nếu mật khẩu có vẻ đã được hash
    if (this.password.startsWith('$2')) {
      console.log('So sánh mật khẩu với bcrypt');
      try {
        return await bcrypt.compare(enteredPassword, this.password);
      } catch (bcryptError) {
        console.error('Lỗi khi so sánh với bcrypt:', bcryptError);
        // Nếu so sánh bcrypt lỗi, thử so sánh trực tiếp
        return this.password === enteredPassword;
      }
    }
    
    // Trường hợp còn lại, so sánh trực tiếp
    console.log('So sánh mật khẩu trực tiếp');
    return this.password === enteredPassword;
  } catch (error) {
    console.error('Lỗi khi so sánh mật khẩu:', error);
    // Trả về false để tránh lỗi 500
    return false;
  }
};

// Phương thức tạo token xác minh email
userSchema.methods.generateVerificationToken = function() {
  const token = require('crypto').randomBytes(32).toString('hex');
  this.emailVerificationToken = token;
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 giờ
  return token;
};

// Phương thức tạo token đặt lại mật khẩu
userSchema.methods.generateResetPasswordToken = function() {
  const token = require('crypto').randomBytes(32).toString('hex');
  this.resetPasswordToken = token;
  this.resetPasswordExpires = Date.now() + 1 * 60 * 60 * 1000; // 1 giờ
  return token;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
