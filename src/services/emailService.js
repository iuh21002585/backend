/**
 * Email Service
 * Service xử lý gửi email thông qua Nodemailer
 */
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Kiểm tra cấu hình email
function validateEmailConfig() {
  return process.env.EMAIL_HOST && 
         process.env.EMAIL_PORT && 
         process.env.EMAIL_USER && 
         process.env.EMAIL_PASS;
}

// Tạo transporter cho Nodemailer
const createTransporter = () => {
  try {
    if (!validateEmailConfig()) {
      console.warn('Cấu hình email thiếu hoặc không đầy đủ. Kiểm tra các biến môi trường EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS');
      return null;
    }

    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT === '465', // true cho port 465, false cho các port khác
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } catch (error) {
    console.error('Lỗi khi khởi tạo transporter email:', error);
    return null;
  }
};

/**
 * Gửi email xác minh
 * @param {Object} user - Đối tượng user cần xác minh
 * @param {string} verificationToken - Token xác minh
 * @returns {Promise<boolean>} Kết quả gửi email
 */
const sendVerificationEmail = async (user, verificationToken) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.error('Không thể gửi email xác minh: Transporter không được tạo');
      return false;
    }
    
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}&email=${user.email}`;
    
    const mailOptions = {
      from: `"IUH PlagCheck" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Xác minh tài khoản IUH PlagCheck của bạn',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">IUH PlagCheck</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #e0e0e0; border-top: none;">
            <h2>Xác minh địa chỉ email của bạn</h2>
            <p>Chào ${user.name},</p>
            <p>Cảm ơn bạn đã đăng ký tài khoản tại IUH PlagCheck. Để hoàn tất quá trình đăng ký, vui lòng xác minh địa chỉ email của bạn bằng cách nhấn vào nút bên dưới:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Xác minh Email</a>
            </div>
            <p>Hoặc sao chép và dán liên kết này vào trình duyệt của bạn:</p>
            <p style="word-break: break-all;">${verificationUrl}</p>
            <p>Liên kết này sẽ hết hạn sau 24 giờ.</p>
            <p>Nếu bạn không đăng ký tài khoản, vui lòng bỏ qua email này.</p>
            <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 14px;">© ${new Date().getFullYear()} IUH PlagCheck. Tất cả các quyền được bảo lưu.</p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email xác minh đã được gửi:', info.messageId);
    return true;
  } catch (error) {
    console.error('Lỗi khi gửi email xác minh:', error);
    return false;
  }
};

/**
 * Gửi email đặt lại mật khẩu
 * @param {Object} user - Đối tượng user cần đặt lại mật khẩu
 * @param {string} resetToken - Token đặt lại mật khẩu
 * @returns {Promise<boolean>} Kết quả gửi email
 */
const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.error('Không thể gửi email đặt lại mật khẩu: Transporter không được tạo');
      return false;
    }
    
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${user.email}`;
    
    const mailOptions = {
      from: `"IUH PlagCheck" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Đặt lại mật khẩu tài khoản IUH PlagCheck của bạn',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">IUH PlagCheck</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #e0e0e0; border-top: none;">
            <h2>Đặt lại mật khẩu của bạn</h2>
            <p>Chào ${user.name},</p>
            <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản IUH PlagCheck của bạn. Nhấn vào nút bên dưới để đặt lại mật khẩu:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Đặt lại mật khẩu</a>
            </div>
            <p>Hoặc sao chép và dán liên kết này vào trình duyệt của bạn:</p>
            <p style="word-break: break-all;">${resetUrl}</p>
            <p>Liên kết này sẽ hết hạn sau 1 giờ.</p>
            <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ với chúng tôi nếu bạn có câu hỏi.</p>
            <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 14px;">© ${new Date().getFullYear()} IUH PlagCheck. Tất cả các quyền được bảo lưu.</p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email đặt lại mật khẩu đã được gửi:', info.messageId);
    return true;
  } catch (error) {
    console.error('Lỗi khi gửi email đặt lại mật khẩu:', error);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  validateEmailConfig
};