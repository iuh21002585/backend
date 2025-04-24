const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Tải biến môi trường
dotenv.config();

// Kiểm tra thông số kết nối MongoDB
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Được đặt' : 'Không được đặt');

// Thử kết nối đến MongoDB
const connectDB = async () => {
  try {
    console.log('Đang thử kết nối đến MongoDB...');
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Tăng timeout cho việc kết nối
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB đã kết nối thành công: ${conn.connection.host}`);
    
    // Kiểm tra cơ sở dữ liệu và các collection
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Các collections hiện có:', collections.map(c => c.name));
    
    return true;
  } catch (error) {
    console.error(`Lỗi kết nối MongoDB: ${error.message}`);
    if (error.name === 'MongooseServerSelectionError') {
      console.error('Không thể kết nối đến MongoDB server. Vui lòng kiểm tra URL kết nối và đảm bảo MongoDB server đang chạy.');
    }
    return false;
  } finally {
    console.log('Đóng kết nối.');
    await mongoose.disconnect();
  }
};

// Chạy hàm kiểm tra
connectDB().then(result => {
  if (result) {
    console.log('Kiểm tra thành công!');
  } else {
    console.log('Kiểm tra thất bại!');
  }
  process.exit();
});
