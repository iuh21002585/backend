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
      required: [true, 'Mật khẩu không được để trống'],
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
  },
  {
    timestamps: true,
  }
);

// Mã hóa mật khẩu trước khi lưu
userSchema.pre('save', async function (next) {
  // Chỉ mã hóa mật khẩu nếu nó đã bị sửa đổi hoặc là tài liệu mới
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Kiểm tra xem mật khẩu đã được mã hóa chưa
    // Mật khẩu đã mã hóa sẽ có định dạng $2a$, $2b$, hoặc $2y$ 
    // (các tiền tố chuẩn của bcrypt)
    if (this.password.match(/^\$2[ayb]\$\d+\$/)) {
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
    // Nếu mật khẩu trong cơ sở dữ liệu là plain text, trả về kết quả so sánh trực tiếp
    if (!this.password.match(/^\$2[ayb]\$\d+\$/)) {
      return this.password === enteredPassword;
    }
    
    // Nếu không, sử dụng bcrypt để so sánh
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    console.error('Lỗi khi so sánh mật khẩu:', error);
    return false;
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
