const express = require('express');
const router = express.Router();
const passport = require('passport');
const {
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
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  googleAuth,
  googleCallback,
  linkGoogleAccount,
  unlinkGoogleAccount
} = require('../controllers/userController');
const { protect, admin } = require('../middlewares/authMiddleware');
const { logActivityMiddleware } = require('../middlewares/loggingMiddleware');

// Routes công khai
router.route('/register')
  .post(
    registerUser,
    logActivityMiddleware(
      'Đăng ký người dùng mới',
      (req) => `Người dùng mới đã đăng ký: ${req.body.name || req.body.email}`,
      'user',
      null,
      true
    )
  );

router.route('/login')
  .post(
    loginUser,
    logActivityMiddleware(
      'Đăng nhập',
      (req) => `Người dùng đã đăng nhập: ${req.body.email}`,
      'user',
      null,
      false  // Đăng nhập là hoạt động private
    )
  );

// Routes cho xác minh email
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);

// Routes cho quên/đặt lại mật khẩu
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Routes cho xác thực Google OAuth
router.get('/google', (req, res, next) => {
  // Lưu URL hiện tại vào để xử lý sau khi đăng nhập thành công
  console.log('Google OAuth request initiated');
  
  const frontendUrl = process.env.FRONTEND_URL || 'https://iuh-plagcheck.onrender.com';
  const failureRedirect = `${frontendUrl}/login?error=google_auth_failed`;
  
  console.log(`Using failure redirect: ${failureRedirect}`);
  console.log('Google OAuth client ID length:', process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.length : 'not set');
  console.log('Google redirect - Headers:', JSON.stringify(req.headers, null, 2));
  
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    failureRedirect: failureRedirect,
    prompt: 'select_account'  // Force Google to always show the account selection screen
  })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  console.log('Google OAuth callback received');
  console.log('Callback query params:', req.query);
  console.log('Callback headers:', JSON.stringify(req.headers, null, 2));
  
  const frontendUrl = process.env.FRONTEND_URL || 'https://iuh-plagcheck.onrender.com';
  const failureRedirect = `${frontendUrl}/login?error=google_auth_failed`;
  
  passport.authenticate('google', { 
    session: false, 
    failureRedirect: failureRedirect
  }, (err, user) => {
    if (err) {
      console.error('Error during Google authentication:', err);
      return res.redirect(failureRedirect);
    }
    if (!user) {
      console.error('No user returned from Google authentication');
      return res.redirect(failureRedirect);
    }
    
    // Đặt user vào req để controller có thể sử dụng
    req.user = user;
    
    // Tiếp tục đến controller xử lý
    return googleCallback(req, res, next);
  })(req, res, next);
});

router.post('/reset-passwords-public', resetPasswordsPublic); // Route công khai chỉ dùng cho debug
router.post('/check-login-issue', checkLoginIssue); // Route kiểm tra vấn đề đăng nhập

// Routes yêu cầu đăng nhập
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

// NEW ROUTE: Allow users to fetch their own profile by ID (needed for Google auth flow)
router.route('/me/:id')
  .get(protect, getUserById);

// Routes cho liên kết/hủy liên kết tài khoản Google
router.post('/link-google', protect, linkGoogleAccount);
router.post('/unlink-google', protect, unlinkGoogleAccount);

// Routes cho admin
router.route('/')
  .get(protect, admin, getUsers)
  .post(protect, admin, createUserByAdmin); // Route tạo người dùng mới bởi admin

router.route('/admin/stats')
  .get(protect, admin, getAdminStats);

router.route('/:id')
  .get(protect, admin, getUserById)
  .put(protect, admin, updateUser)
  .delete(protect, admin, deleteUser);

// Route đặt lại mật khẩu - chỉ dành cho admin
router.post('/reset-passwords', protect, admin, resetPasswords);

module.exports = router;
