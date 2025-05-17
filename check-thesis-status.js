// Hàm kiểm tra trạng thái luận văn
const mongoose = require('mongoose');
const Thesis = require('./src/models/Thesis');
require('dotenv').config({ path: './.env' });

const getThesisStatus = async () => {
  try {
    console.log('Đang kết nối đến MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Đã kết nối đến MongoDB thành công');
      // Đếm số lượng luận văn theo trạng thái
    const pendingCount = await Thesis.countDocuments({ status: 'pending' });
    const queuedCount = await Thesis.countDocuments({ status: 'queued' });
    const processingCount = await Thesis.countDocuments({ status: 'processing' });
    const completedCount = await Thesis.countDocuments({ status: 'completed' });
    const errorCount = await Thesis.countDocuments({ status: 'error' });
    
    console.log('Thống kê trạng thái luận văn:');
    console.log(`- Đang chờ (pending): ${pendingCount}`);
    console.log(`- Đang trong hàng đợi (queued): ${queuedCount}`);
    console.log(`- Đang xử lý (processing): ${processingCount}`);
    console.log(`- Hoàn thành (completed): ${completedCount}`);
    console.log(`- Lỗi (error): ${errorCount}`);
    
    // Danh sách 5 luận văn gần nhất
    const recentTheses = await Thesis.find()
      .select('_id title status uploadedAt')
      .sort({ uploadedAt: -1 })
      .limit(5);
      
    console.log('\nDanh sách 5 luận văn gần nhất:');
    recentTheses.forEach(thesis => {
      const date = thesis.uploadedAt ? new Date(thesis.uploadedAt).toLocaleString() : 'N/A';
      console.log(`${thesis._id} - ${thesis.title} - Trạng thái: ${thesis.status} - Tải lên: ${date}`);
    });
      // Tìm luận văn đang ở trạng thái chờ xử lý ("pending" hoặc "queued")
    const pendingTheses = await Thesis.find({ status: { $in: ['pending', 'queued'] } })
      .select('_id title status uploadedAt')
      .sort({ uploadedAt: 1 }) // Lấy cái cũ nhất trước
      .limit(5);
      
    console.log('\nDanh sách luận văn đang chờ xử lý (pending hoặc queued):');
    if (pendingTheses.length === 0) {
      console.log('Không có luận văn nào đang chờ xử lý');
    } else {
      pendingTheses.forEach(thesis => {
        const date = thesis.uploadedAt ? new Date(thesis.uploadedAt).toLocaleString() : 'N/A';
        console.log(`${thesis._id} - ${thesis.title} - Trạng thái: ${thesis.status} - Tải lên: ${date}`);
      });
    }
    
    // Tìm luận văn đang xử lý
    const processingTheses = await Thesis.find({ status: 'processing' })
      .select('_id title uploadedAt')
      .sort({ uploadedAt: 1 })
      .limit(5);
      
    console.log('\nDanh sách luận văn đang xử lý (processing):');
    if (processingTheses.length === 0) {
      console.log('Không có luận văn nào đang xử lý');
    } else {
      processingTheses.forEach(thesis => {
        const date = thesis.uploadedAt ? new Date(thesis.uploadedAt).toLocaleString() : 'N/A';
        console.log(`${thesis._id} - ${thesis.title} - Tải lên: ${date}`);
      });
    }
    
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái luận văn:', error);
  } finally {
    // Đóng kết nối
    await mongoose.disconnect();
    console.log('Đã đóng kết nối đến MongoDB');
  }
};

// Thực thi hàm
getThesisStatus().then(() => {
  console.log('Đã kiểm tra xong trạng thái luận văn');
  process.exit(0);
}).catch(err => {
  console.error('Lỗi khi thực thi kiểm tra:', err);
  process.exit(1);
});
