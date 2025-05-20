#!/usr/bin/env node
/**
 * Script tạo monitor thu nhỏ để kiểm tra quá trình xử lý luận văn
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Kết nối đến cơ sở dữ liệu MongoDB
async function connectToDatabase() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iuh_plagcheck';
    console.log(`Kết nối đến MongoDB: ${MONGODB_URI}`);
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Đã kết nối thành công đến MongoDB!');
    return true;
  } catch (error) {
    console.error('Lỗi khi kết nối đến MongoDB:', error);
    return false;
  }
}

// Kiểm tra trạng thái các luận văn
async function checkTheses() {
  try {
    // Đảm bảo model Thesis đã được tải
    const Thesis = require('./src/models/Thesis');
    
    // Đếm số lượng luận văn theo trạng thái
    const pendingCount = await Thesis.countDocuments({ status: 'pending' });
    const processingCount = await Thesis.countDocuments({ status: 'processing' });
    const completedCount = await Thesis.countDocuments({ status: 'completed' });
    const errorCount = await Thesis.countDocuments({ status: 'error' });
    
    console.log('\n=== TRẠNG THÁI LUẬN VĂN ===');
    console.log(`- Đang chờ xử lý: ${pendingCount}`);
    console.log(`- Đang xử lý: ${processingCount}`);
    console.log(`- Đã hoàn thành: ${completedCount}`);
    console.log(`- Lỗi: ${errorCount}`);
    
    // Hiển thị chi tiết các luận văn có lỗi
    if (errorCount > 0) {
      const errorTheses = await Thesis.find({ status: 'error' })
        .select('_id title errorMessage')
        .limit(5);
      
      console.log('\n=== LUẬN VĂN LỖI GẦN ĐÂY ===');
      errorTheses.forEach(thesis => {
        console.log(`- ${thesis.title} (${thesis._id}): ${thesis.errorMessage || 'Không có thông tin lỗi'}`);
      });
    }
    
    // Hiển thị chi tiết các luận văn đã hoàn thành gần đây nhất
    const recentCompletedTheses = await Thesis.find({ status: 'completed' })
      .sort({ completedAt: -1 })
      .select('_id title plagiarismScore aiPlagiarismScore processingTime')
      .limit(5);
    
    if (recentCompletedTheses.length > 0) {
      console.log('\n=== LUẬN VĂN HOÀN THÀNH GẦN ĐÂY NHẤT ===');
      recentCompletedTheses.forEach(thesis => {
        console.log(`- ${thesis.title} (${thesis._id}): `);
        console.log(`  Đạo văn: ${thesis.plagiarismScore || 0}%, AI: ${thesis.aiPlagiarismScore || 0}%, Thời gian: ${thesis.processingTime || 'N/A'} giây`);
      });
    }
    
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái luận văn:', error);
  }
}

// Hiển thị chi tiết của một luận văn cụ thể
async function showThesisDetails(thesisId) {
  try {
    // Đảm bảo model Thesis đã được tải
    const Thesis = require('./src/models/Thesis');
    const User = require('./src/models/User');
    
    // Tìm luận văn
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      console.log(`Không tìm thấy luận văn với ID: ${thesisId}`);
      return;
    }
    
    // Tìm thông tin người dùng
    const user = await User.findById(thesis.userId);
    
    console.log('\n=== CHI TIẾT LUẬN VĂN ===');
    console.log(`Tiêu đề: ${thesis.title}`);
    console.log(`Trạng thái: ${thesis.status}`);
    console.log(`Người dùng: ${user ? user.name : 'Không rõ'} (${user ? user.email : 'N/A'})`);
    console.log(`Đạo văn truyền thống: ${thesis.plagiarismScore || 0}%`);
    console.log(`Nội dung AI: ${thesis.aiPlagiarismScore || 0}%`);
    
    // Hiển thị nguồn
    if (thesis.sources && thesis.sources.length > 0) {
      console.log('\n=== NGUỒN ===');
      thesis.sources.slice(0, 5).forEach((source, index) => {
        console.log(`${index + 1}. ${source.title} (${source.similarity || 0}%)`);
        if (source.author) console.log(`   Tác giả: ${source.author}`);
        if (source.url) console.log(`   URL: ${source.url}`);
      });
      
      if (thesis.sources.length > 5) {
        console.log(`...và ${thesis.sources.length - 5} nguồn khác`);
      }
    }
    
    // Hiển thị một số đoạn trùng khớp
    if (thesis.textMatches && thesis.textMatches.length > 0) {
      console.log('\n=== ĐOẠN TRÙNG KHỚP ===');
      thesis.textMatches.slice(0, 3).forEach((match, index) => {
        console.log(`${index + 1}. Độ tương đồng: ${match.similarity || 0}%`);
        console.log(`   Đoạn văn: ${(match.thesisText || '').substring(0, 100)}...`);
        if (match.source && match.source.title) {
          console.log(`   Nguồn: ${match.source.title}`);
        }
      });
      
      if (thesis.textMatches.length > 3) {
        console.log(`...và ${thesis.textMatches.length - 3} đoạn trùng khớp khác`);
      }
    }
    
  } catch (error) {
    console.error('Lỗi khi hiển thị chi tiết luận văn:', error);
  }
}

// Hàm chính
async function main() {
  try {
    // Kết nối đến cơ sở dữ liệu
    const connected = await connectToDatabase();
    
    if (!connected) {
      process.exit(1);
    }
    
    // Phân tích tham số dòng lệnh
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
      // Hiển thị chi tiết của một luận văn cụ thể
      await showThesisDetails(args[0]);
    } else {
      // Hiển thị tổng quan trạng thái các luận văn
      await checkTheses();
    }
    
  } catch (error) {
    console.error('Lỗi:', error);
  } finally {
    // Ngắt kết nối MongoDB trước khi thoát
    await mongoose.disconnect();
    console.log('\nĐã ngắt kết nối từ MongoDB.');
  }
}

// Thực thi
main();
