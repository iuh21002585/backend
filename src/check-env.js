const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Tải biến môi trường
dotenv.config();

// Kiểm tra file .env tồn tại
const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('CẢNH BÁO: File .env không tồn tại. Vui lòng tạo file .env từ .env.example');
}

console.log('=== Kiểm tra biến môi trường ===');

// Kiểm tra các biến môi trường cơ bản cần thiết
const requiredEnvVars = ['PORT', 'MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(env => !process.env[env]);

if (missingEnvVars.length > 0) {
  console.error('Các biến môi trường cơ bản sau bị thiếu:', missingEnvVars.join(', '));
} else {
  console.log('✅ Tất cả các biến môi trường cơ bản đều có sẵn');

  console.log('- PORT:', process.env.PORT);
  console.log('- MONGODB_URI:', process.env.MONGODB_URI ? 
    (process.env.MONGODB_URI.substring(0, 10) + '...' + process.env.MONGODB_URI.substring(process.env.MONGODB_URI.length - 5)) : 'Không có');
  console.log('- JWT_SECRET:', process.env.JWT_SECRET ? 
    (process.env.JWT_SECRET.substring(0, 3) + '...' + process.env.JWT_SECRET.substring(process.env.JWT_SECRET.length - 3)) : 'Không có');
}

// Kiểm tra biến môi trường storage
console.log('\n--- Kiểm tra cấu hình Storage ---');

console.log('Storage: Backblaze B2');

// Kiểm tra các biến môi trường Backblaze B2
const b2EnvVars = ['B2_BUCKET_NAME', 'B2_ACCESS_KEY_ID', 'B2_SECRET_ACCESS_KEY', 'B2_ENDPOINT', 'B2_REGION'];
const missingB2Vars = b2EnvVars.filter(env => !process.env[env]);

if (missingB2Vars.length > 0) {
  console.error('⚠️ Các biến môi trường Backblaze B2 sau bị thiếu:', missingB2Vars.join(', '));
  console.error('⚠️ Vui lòng cập nhật file .env với thông tin Backblaze B2 chính xác');
} else {
  console.log('✅ Tất cả các biến môi trường Backblaze B2 đều có sẵn');
  console.log('- B2_BUCKET_NAME:', process.env.B2_BUCKET_NAME);
  console.log('- B2_ENDPOINT:', process.env.B2_ENDPOINT);
  console.log('- B2_REGION:', process.env.B2_REGION);
  console.log('- B2_ACCESS_KEY_ID:', process.env.B2_ACCESS_KEY_ID ? 
    (process.env.B2_ACCESS_KEY_ID.substring(0, 5) + '...' + process.env.B2_ACCESS_KEY_ID.substring(process.env.B2_ACCESS_KEY_ID.length - 3)) : 'Không có');
  console.log('- B2_SECRET_ACCESS_KEY:', process.env.B2_SECRET_ACCESS_KEY ? 
    (process.env.B2_SECRET_ACCESS_KEY.substring(0, 3) + '...' + process.env.B2_SECRET_ACCESS_KEY.substring(process.env.B2_SECRET_ACCESS_KEY.length - 3)) : 'Không có');
}

// Kiểm tra biến môi trường cho các dịch vụ phát hiện đạo văn
console.log('\n--- Kiểm tra cấu hình Dịch vụ Phát hiện Đạo văn ---');

// OpenAI API Key
if (process.env.OPENAI_API_KEY) {
  console.log('✅ OPENAI_API_KEY: ' + 
    (process.env.OPENAI_API_KEY.substring(0, 6) + '...' + process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)));
} else {
  console.error('⚠️ OPENAI_API_KEY: Không có');
}

// Google API Keys
if (process.env.GOOGLE_API_KEYS) {
  const keys = process.env.GOOGLE_API_KEYS.split(',');
  console.log(`✅ GOOGLE_API_KEYS: ${keys.length} key(s) đã cấu hình`);
  console.log('- Search Engine ID:', process.env.SEARCH_ENGINE_ID || 'Không có');
} else {
  console.error('⚠️ GOOGLE_API_KEYS: Không có');
}

// Gemini API Key
if (process.env.GEMINI_API_KEY) {
  console.log('✅ GEMINI_API_KEY: ' + 
    (process.env.GEMINI_API_KEY.substring(0, 6) + '...' + process.env.GEMINI_API_KEY.substring(process.env.GEMINI_API_KEY.length - 4)));
} else {
  console.error('⚠️ GEMINI_API_KEY: Không có');
}

// GPTZero API Key
if (process.env.GPTZERO_API_KEY && process.env.GPTZERO_API_KEY !== 'your_gptzero_api_key') {
  console.log('✅ GPTZERO_API_KEY: ' + 
    (process.env.GPTZERO_API_KEY.substring(0, 3) + '...' + process.env.GPTZERO_API_KEY.substring(process.env.GPTZERO_API_KEY.length - 3)));
} else {
  console.error('⚠️ GPTZERO_API_KEY: Không có hoặc giá trị mặc định');
}

console.log('=====================================');
