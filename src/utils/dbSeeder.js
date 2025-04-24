require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Thesis = require('../models/Thesis');

// Kết nối tới MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB đã kết nối: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Lỗi: ${error.message}`);
    process.exit(1);
  }
};

// Xóa dữ liệu hiện có
const clearData = async () => {
  try {
    await User.deleteMany();
    await Thesis.deleteMany();
    console.log('Đã xóa tất cả dữ liệu hiện có');
  } catch (error) {
    console.error(`Lỗi khi xóa dữ liệu: ${error.message}`);
    process.exit(1);
  }
};

// Import dữ liệu users
const importUsers = async () => {
  try {
    const userData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../data/users.json'), 'utf-8')
    );

    // Xóa người dùng hiện tại
    await User.deleteMany({});

    // Chuyển đổi định dạng ObjectId và Date từ JSON
    for (const user of userData) {
      const newUser = new User({
        _id: new mongoose.Types.ObjectId(user._id.$oid),
        name: user.name,
        email: user.email,
        password: user.password, // Password sẽ được mã hóa bởi middleware pre save
        isAdmin: user.isAdmin,
        createdAt: new Date(user.createdAt.$date),
        updatedAt: new Date(user.updatedAt.$date)
      });
      
      await newUser.save();
    }

    console.log('Đã import dữ liệu người dùng thành công');
  } catch (error) {
    console.error(`Lỗi khi import users: ${error.message}`);
    process.exit(1);
  }
};

// Import dữ liệu theses
const importTheses = async () => {
  try {
    const thesisData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../data/theses.json'), 'utf-8')
    );

    // Chuyển đổi định dạng ObjectId và Date từ JSON
    const formattedData = thesisData.map(thesis => ({
      ...thesis,
      _id: new mongoose.Types.ObjectId(thesis._id.$oid),
      user: new mongoose.Types.ObjectId(thesis.user.$oid),
      createdAt: new Date(thesis.createdAt.$date),
      updatedAt: new Date(thesis.updatedAt.$date)
    }));

    await Thesis.insertMany(formattedData);
    console.log('Đã import dữ liệu luận văn thành công');
  } catch (error) {
    console.error(`Lỗi khi import theses: ${error.message}`);
    process.exit(1);
  }
};

// Thực hiện import dữ liệu
const importData = async () => {
  try {
    await connectDB();
    
    // Hỏi người dùng có muốn xóa dữ liệu hiện có không
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Bạn có muốn xóa dữ liệu hiện có trước khi import dữ liệu mới không? (y/n) ', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        await clearData();
      }
      
      // Import dữ liệu
      await importUsers();
      await importTheses();
      
      console.log('Import dữ liệu hoàn tất!');
      process.exit(0);
    });
  } catch (error) {
    console.error(`Lỗi: ${error.message}`);
    process.exit(1);
  }
};

// Chạy script
importData();
