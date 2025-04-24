const dotenv = require('dotenv');

// Tải biến môi trường
dotenv.config();

// Kiểm tra các biến môi trường cần thiết
const requiredEnvVars = ['PORT', 'MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(env => !process.env[env]);

console.log('=== Kiểm tra biến môi trường ===');

if (missingEnvVars.length > 0) {
  console.error('Các biến môi trường sau bị thiếu:', missingEnvVars.join(', '));
} else {
  console.log('Tất cả các biến môi trường cần thiết đều có sẵn');

  console.log('PORT:', process.env.PORT);
  console.log('MONGODB_URI:', process.env.MONGODB_URI ? 
    (process.env.MONGODB_URI.substr(0, 10) + '...' + process.env.MONGODB_URI.substr(-5)) : 'Không có');
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 
    (process.env.JWT_SECRET.substr(0, 3) + '...' + process.env.JWT_SECRET.substr(-3)) : 'Không có');
}

console.log('================================');
