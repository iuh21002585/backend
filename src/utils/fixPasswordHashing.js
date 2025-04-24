/**
 * Script để khắc phục vấn đề mật khẩu plain text
 * 
 * Vấn đề: Mật khẩu trong cơ sở dữ liệu được lưu ở dạng văn bản thuần túy (plain text)
 * trong khi mô hình User có middleware pre-save sử dụng bcrypt để mã hóa mật khẩu.
 * 
 * Giải pháp: Script này tìm tất cả người dùng trong cơ sở dữ liệu và mã hóa lại mật khẩu
 * nếu nó đang ở dạng plain text.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/User');

// Tải biến môi trường
dotenv.config();

/**
 * Kiểm tra xem một chuỗi có phải là mật khẩu đã được hash bởi bcrypt không
 * @param {string} password - Chuỗi cần kiểm tra
 * @returns {boolean} - true nếu là mật khẩu đã hash, false nếu là plain text
 */
const isBcryptHash = (password) => {
  return /^\$2[ayb]\$[0-9]{2}\$[A-Za-z0-9./]{53}$/.test(password);
};

/**
 * Hàm chính để sửa lỗi mật khẩu plain text
 */
const fixPasswordHashing = async () => {
  try {
    // Kết nối đến cơ sở dữ liệu
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Đã kết nối đến cơ sở dữ liệu MongoDB');

    // Lấy tất cả người dùng
    const users = await User.find({});
    console.log(`Tìm thấy ${users.length} người dùng`);

    let hashedCount = 0;
    let plainTextCount = 0;

    // Kiểm tra và cập nhật mật khẩu
    for (const user of users) {
      if (isBcryptHash(user.password)) {
        hashedCount++;
      } else {
        plainTextCount++;
        console.log(`Mật khẩu của người dùng ${user.email} đang ở dạng plain text. Tiến hành mã hóa...`);
        
        // Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
        
        // Lưu trực tiếp thay vì qua middleware pre-save
        await User.updateOne({ _id: user._id }, { password: user.password });
        console.log(`Đã mã hóa mật khẩu cho người dùng ${user.email}`);
      }
    }

    console.log('\n--- Tổng kết ---');
    console.log(`Tổng số người dùng: ${users.length}`);
    console.log(`Số người dùng có mật khẩu đã hash: ${hashedCount}`);
    console.log(`Số người dùng có mật khẩu plain text đã được sửa: ${plainTextCount}`);
    console.log('Quá trình sửa lỗi hoàn tất!');

    // Ngắt kết nối
    await mongoose.disconnect();
    console.log('Đã ngắt kết nối cơ sở dữ liệu');

  } catch (error) {
    console.error('Lỗi trong quá trình sửa lỗi mật khẩu:', error);
  }
};

// Chạy hàm sửa lỗi
if (require.main === module) {
  fixPasswordHashing().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Lỗi không xác định:', error);
    process.exit(1);
  });
}

module.exports = { fixPasswordHashing, isBcryptHash };
