const mongoose = require('mongoose');
const Thesis = require('./src/models/Thesis');
require('dotenv').config({ path: './.env' });

const getThesisDetails = async (thesisId) => {
  try {
    console.log('Đang kết nối đến MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Đã kết nối đến MongoDB thành công');
      // Tìm luận văn theo ID
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      console.log(`Không tìm thấy luận văn với ID: ${thesisId}`);
      return;
    }
    
    console.log('Thông tin chi tiết luận văn:');
    console.log(`ID: ${thesis._id}`);
    console.log(`Tiêu đề: ${thesis.title}`);
    console.log(`Trạng thái: ${thesis.status}`);
    console.log(`Tải lên lúc: ${thesis.uploadedAt ? new Date(thesis.uploadedAt).toLocaleString() : 'N/A'}`);
    console.log(`Kích thước: ${thesis.fileSize ? (thesis.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
    console.log(`Loại file: ${thesis.fileType || 'N/A'}`);
    console.log(`Đường dẫn file: ${thesis.filePath || 'N/A'}`);
    
    // Thông tin người dùng
    console.log('\nThông tin người dùng:');
    if (thesis.userId) {
      console.log(`User ID: ${thesis.userId._id}`);
      console.log(`Email: ${thesis.userId.email || 'N/A'}`);
      console.log(`Tên: ${thesis.userId.name || 'N/A'}`);
    } else {
      console.log('Không có thông tin người dùng hoặc field userId không đúng');
      
      // Kiểm tra xem có trường user không (một số hệ thống cũ có thể sử dụng field "user" thay vì "userId")
      if (thesis.user) {
        console.log(`Có trường user: ${thesis.user}`);
        
        // Thử lấy thông tin từ trường user
        const User = require('./src/models/User');
        const userInfo = await User.findById(thesis.user);
        
        if (userInfo) {
          console.log(`Thông tin user từ trường "user":`);
          console.log(`User ID: ${userInfo._id}`);
          console.log(`Email: ${userInfo.email || 'N/A'}`);
          console.log(`Tên: ${userInfo.name || 'N/A'}`);
        } else {
          console.log(`Không tìm thấy thông tin user với ID: ${thesis.user}`);
        }
      } else {
        console.log('Không có thông tin trong cả hai trường userId và user');
      }
    }
    
  } catch (error) {
    console.error('Lỗi khi kiểm tra thông tin luận văn:', error);
  } finally {
    // Đóng kết nối
    await mongoose.disconnect();
    console.log('Đã đóng kết nối đến MongoDB');
  }
};

// Thực thi hàm với ID từ dòng lệnh
const thesisId = process.argv[2];
if (!thesisId) {
  console.log('Vui lòng cung cấp ID của luận văn');
  process.exit(1);
}

getThesisDetails(thesisId).then(() => {
  console.log('Đã kiểm tra xong thông tin luận văn');
  process.exit(0);
}).catch(err => {
  console.error('Lỗi khi thực thi kiểm tra:', err);
  process.exit(1);
});
