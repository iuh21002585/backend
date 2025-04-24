/**
 * Script để xóa toàn bộ dữ liệu trong cơ sở dữ liệu
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Tải biến môi trường
dotenv.config();

/**
 * Hàm chính để xóa toàn bộ dữ liệu
 */
const clearDatabase = async () => {
  try {
    // Kết nối đến cơ sở dữ liệu
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Đã kết nối đến cơ sở dữ liệu MongoDB');

    // Lấy tất cả các collections
    const collections = await mongoose.connection.db.collections();
    
    console.log(`Tìm thấy ${collections.length} collections`);
    
    // Xóa dữ liệu từ mỗi collection
    for (const collection of collections) {
      const collectionName = collection.collectionName;
      const count = await collection.countDocuments();
      
      await collection.deleteMany({});
      
      console.log(`Đã xóa ${count} bản ghi từ collection ${collectionName}`);
    }

    console.log('\n--- Tổng kết ---');
    console.log(`Đã xóa dữ liệu từ ${collections.length} collections`);
    console.log('Quá trình xóa dữ liệu hoàn tất!');

    // Ngắt kết nối
    await mongoose.disconnect();
    console.log('Đã ngắt kết nối cơ sở dữ liệu');

  } catch (error) {
    console.error('Lỗi trong quá trình xóa dữ liệu:', error);
  }
};

// Chạy hàm xóa dữ liệu
if (require.main === module) {
  clearDatabase().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Lỗi không xác định:', error);
    process.exit(1);
  });
}

module.exports = { clearDatabase };
