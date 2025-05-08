/**
 * Cấu hình Passport.js cho Google OAuth
 */
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

// Kiểm tra cấu hình Google OAuth
function validateGoogleConfig() {
  return process.env.GOOGLE_CLIENT_ID && 
         process.env.GOOGLE_CLIENT_SECRET;
}

// Xác định callback URL dựa trên môi trường
function getCallbackUrl() {
  // Sử dụng biến môi trường nếu có
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL;
  }
  
  // Ưu tiên sử dụng BACKEND_URL từ biến môi trường
  const backendUrl = process.env.BACKEND_URL || 'https://backend-6c5g.onrender.com';
  return `${backendUrl}/api/users/google/callback`;
}

// Cấu hình Passport.js
const configurePassport = () => {
  if (!validateGoogleConfig()) {
    console.warn('Cấu hình Google OAuth thiếu hoặc không đầy đủ. Kiểm tra các biến môi trường GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET');
    console.log('GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID);
    console.log('GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET); 
    return;
  }

  const callbackURL = getCallbackUrl();
  console.log(`Configuring Google OAuth with callback URL: ${callbackURL}`);
  console.log(`Current NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`Current FRONTEND_URL: ${process.env.FRONTEND_URL}`);
  console.log(`Current BACKEND_URL: ${process.env.BACKEND_URL}`);

  // Cấu hình Google Strategy
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL,
      scope: ['profile', 'email'],
      passReqToCallback: true
    },
    async function(req, accessToken, refreshToken, profile, done) {
      console.log('Google strategy callback received with profile:', profile.id);
      try {
        // Kiểm tra xem user đã tồn tại chưa
        let user = await User.findOne({ googleId: profile.id });
        
        // Nếu người dùng chưa tồn tại, kiểm tra email
        if (!user && profile.emails && profile.emails.length > 0) {
          const email = profile.emails[0].value;
          user = await User.findOne({ email });
          
          // Nếu tìm thấy user với email, liên kết tài khoản Google
          if (user) {
            user.googleId = profile.id;
            user.isEmailVerified = true; // Đánh dấu email đã xác minh vì Google đã xác minh
            
            // Cập nhật hình ảnh hồ sơ nếu chưa có
            if (!user.profilePicture && profile.photos && profile.photos.length > 0) {
              user.profilePicture = profile.photos[0].value;
            }
            
            await user.save();
            console.log(`Đã liên kết tài khoản Google với user: ${user.email}`);
          } else {
            // Tạo người dùng mới nếu chưa tồn tại
            user = new User({
              googleId: profile.id,
              name: profile.displayName,
              email: email,
              accountType: 'google',
              isEmailVerified: true, // Email đã được Google xác minh
              profilePicture: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null
            });
            
            await user.save();
            console.log(`Đã tạo tài khoản mới qua Google: ${user.email}`);
          }
        }
        
        if (user) {
          // Cập nhật thời gian đăng nhập cuối
          user.lastLogin = Date.now();
          await user.save();
        }
        
        return done(null, user);
      } catch (error) {
        console.error('Lỗi xác thực Google:', error);
        return done(error, null);
      }
    }
  ));
  
  // Serialize và deserialize user cho session
  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(async function(id, done) {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
  
  console.log('Đã cấu hình Passport.js với Google OAuth');
};

module.exports = {
  configurePassport,
  validateGoogleConfig
};