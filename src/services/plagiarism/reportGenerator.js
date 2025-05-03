/**
 * reportGenerator.js
 * Module để tạo báo cáo đạo văn dạng PDF
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const Thesis = require('../../models/Thesis');
const { uploadCheckedFileToStorage, STORAGE_PROVIDER } = require('../../utils/storageManager');
const { calculatePageNumber } = require('./utils');

/**
 * Tạo báo cáo đạo văn dạng PDF
 * @param {string} thesisId - ID của luận văn
 * @param {Object} plagiarismResults - Kết quả phát hiện đạo văn
 * @param {string} reportType - Loại báo cáo ('traditional' hoặc 'ai')
 * @returns {Promise<Object>} - Kết quả tạo báo cáo
 */
const generatePlagiarismReport = async (thesisId, plagiarismResults, reportType = 'traditional') => {
  try {
    console.log(`Bắt đầu tạo báo cáo ${reportType} cho luận văn ${thesisId}`);

    // Lấy thông tin chi tiết luận văn từ cơ sở dữ liệu
    const thesis = await Thesis.findById(thesisId).populate('user', 'name email');

    if (!thesis) {
      throw new Error('Không tìm thấy luận văn');
    }

    // Tạo một tài liệu PDF mới
    const pdfBuffer = await createPdfReport(thesis, plagiarismResults, reportType);
    
    // Upload báo cáo lên storage service (sử dụng Storage Manager để hỗ trợ cả MinIO và Backblaze B2)
    const filename = `report-${reportType}-${thesisId}.pdf`;
    const uploadResult = await uploadCheckedFileToStorage(pdfBuffer, filename, reportType);

    if (!uploadResult.success) {
      throw new Error(`Không thể lưu báo cáo ${reportType}: ${uploadResult.error}`);
    }

    // Trả về thông tin báo cáo
    return {
      success: true,
      reportPath: uploadResult.objectName,
      reportUrl: uploadResult.url,
      reportType: reportType,
      storageProvider: STORAGE_PROVIDER
    };
  } catch (error) {
    console.error(`Lỗi khi tạo báo cáo ${reportType}:`, error);
    return {
      success: false,
      error: error.message,
      reportType: reportType
    };
  }
};

/**
 * Tạo nội dung PDF cho báo cáo đạo văn
 * @param {Object} thesis - Thông tin luận văn
 * @param {Object} plagiarismResults - Kết quả phát hiện đạo văn
 * @param {string} reportType - Loại báo cáo ('traditional' hoặc 'ai')
 * @returns {Promise<Buffer>} - Buffer chứa dữ liệu PDF
 */
const createPdfReport = async (thesis, plagiarismResults, reportType) => {
  return new Promise((resolve, reject) => {
    try {
      // Tạo một tài liệu PDF mới
      const doc = new PDFDocument({ 
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 72, right: 72 },
        info: {
          Title: `Báo cáo phát hiện đạo văn ${reportType === 'ai' ? 'AI' : 'truyền thống'}`,
          Author: 'ThesisGuard'
        }
      });

      // Tạo buffer để lưu PDF
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Thêm thông tin tiêu đề báo cáo
      addReportHeader(doc, thesis, reportType);

      // Thêm thông tin tóm tắt đạo văn
      addPlagiarismSummary(doc, thesis, plagiarismResults, reportType);

      // Thêm chi tiết đạo văn
      if (reportType === 'traditional') {
        addTraditionalPlagiarismDetails(doc, thesis, plagiarismResults);
      } else {
        addAIPlagiarismDetails(doc, thesis, plagiarismResults);
      }

      // Thêm chân trang
      addFooter(doc);

      // Hoàn thành tài liệu PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Thêm tiêu đề báo cáo
 * @param {PDFDocument} doc - Tài liệu PDF
 * @param {Object} thesis - Thông tin luận văn
 * @param {string} reportType - Loại báo cáo
 */
const addReportHeader = (doc, thesis, reportType) => {
  // Logo (giả lập bằng text logo)
  doc.fontSize(24)
     .fillColor('#4A6FA5')
     .text('ThesisGuard', { align: 'center' });
  
  doc.moveDown(0.5);
  
  // Tiêu đề báo cáo
  doc.fontSize(16)
     .fillColor('#333333')
     .text(`BÁO CÁO PHÁT HIỆN ĐẠO VĂN ${reportType.toUpperCase() === 'AI' ? 'AI' : 'TRUYỀN THỐNG'}`, { align: 'center' });
  
  doc.moveDown(0.5);
  
  // Tiêu đề luận văn
  doc.fontSize(14)
     .fillColor('#333333')
     .text(thesis.title, { align: 'center' });
  
  doc.moveDown(2);
  
  // Thông tin luận văn
  doc.fontSize(12)
     .fillColor('#555555');
  
  const createdAt = thesis.createdAt ? new Date(thesis.createdAt).toLocaleDateString('vi-VN') : 'Không xác định';
  
  // Tạo bảng thông tin
  const tableTop = doc.y;
  const tableLeft = 72;
  const colWidth = 150;
  const rowHeight = 20;
  const rows = [
    ['ID Luận văn:', thesis._id.toString()],
    ['Tác giả:', thesis.user ? thesis.user.name : 'Không xác định'],
    ['Email:', thesis.user ? thesis.user.email : 'Không xác định'],
    ['Khoa:', thesis.faculty || 'Không xác định'],
    ['Ngày tải lên:', createdAt],
    ['Kích thước file:', formatFileSize(thesis.fileSize)],
    ['Loại file:', thesis.fileType || 'Không xác định']
  ];
  
  // Vẽ từng hàng trong bảng
  rows.forEach((row, i) => {
    doc.text(row[0], tableLeft, tableTop + i * rowHeight)
       .text(row[1], tableLeft + colWidth, tableTop + i * rowHeight);
  });
  
  doc.moveDown(rows.length + 1);
};

/**
 * Thêm tóm tắt kết quả đạo văn
 * @param {PDFDocument} doc - Tài liệu PDF
 * @param {Object} thesis - Thông tin luận văn
 * @param {Object} plagiarismResults - Kết quả phát hiện đạo văn
 * @param {string} reportType - Loại báo cáo
 */
const addPlagiarismSummary = (doc, thesis, plagiarismResults, reportType) => {
  // Tiêu đề phần tóm tắt
  doc.fontSize(14)
     .fillColor('#333333')
     .text('TÓM TẮT KẾT QUẢ', { underline: true });
  
  doc.moveDown(0.5);
  
  // Vẽ biểu đồ tròn đơn giản thể hiện tỷ lệ đạo văn
  const centerX = doc.page.width / 2;
  const centerY = doc.y + 80;
  const radius = 60;
  
  const score = reportType === 'ai' 
    ? thesis.aiPlagiarismScore || 0
    : thesis.plagiarismScore || 0;
  
  // Vẽ hình tròn nền
  doc.circle(centerX, centerY, radius)
     .fillAndStroke('#EEEEEE', '#CCCCCC');
  
  // Vẽ phần tỷ lệ đạo văn (hình quạt)
  if (score > 0) {
    const angleInRadians = (score / 100) * Math.PI * 2;
    doc.path(`M ${centerX} ${centerY} L ${centerX} ${centerY - radius} A ${radius} ${radius} 0 ${angleInRadians > Math.PI ? 1 : 0} 1 ${centerX + radius * Math.sin(angleInRadians)} ${centerY - radius * Math.cos(angleInRadians)} Z`)
       .fill(score < 20 ? '#4CAF50' : score < 50 ? '#FFC107' : '#F44336');
  }
  
  // Hiển thị số phần trăm ở giữa
  doc.fontSize(24)
     .fillColor('#333333')
     .text(`${score}%`, centerX - 25, centerY - 12, { width: 50, align: 'center' });
  
  doc.moveDown(7);
  
  // Thông tin chi tiết
  doc.fontSize(12)
     .fillColor('#555555');
  
  if (reportType === 'traditional') {
    const sources = thesis.sources || [];
    const textMatches = thesis.textMatches || [];
    
    doc.text(`Tỷ lệ đạo văn phát hiện: ${score}%`, { continued: true })
       .fillColor(score < 20 ? '#4CAF50' : score < 50 ? '#FFC107' : '#F44336')
       .text(` (${score < 20 ? 'Thấp' : score < 50 ? 'Trung bình' : 'Cao'})`)
       .fillColor('#555555');
    
    doc.moveDown(0.5);
    doc.text(`Số nguồn phát hiện được: ${sources.length}`);
    doc.moveDown(0.5);
    doc.text(`Số đoạn văn trùng lặp: ${textMatches.length}`);
  } else {
    const aiDetails = thesis.aiPlagiarismDetails || [];
    
    doc.text(`Tỷ lệ nội dung AI phát hiện: ${score}%`, { continued: true })
       .fillColor(score < 20 ? '#4CAF50' : score < 50 ? '#FFC107' : '#F44336')
       .text(` (${score < 20 ? 'Thấp' : score < 50 ? 'Trung bình' : 'Cao'})`)
       .fillColor('#555555');
    
    doc.moveDown(0.5);
    doc.text(`Số đoạn văn có dấu hiệu tạo bởi AI: ${aiDetails.length}`);
    
    doc.moveDown(0.5);
    doc.text(`Độ tin cậy: ${score < 30 ? 'Cao' : score < 60 ? 'Trung bình' : 'Thấp'}`);
  }
  
  doc.moveDown(1);
  
  // Thêm phần giải thích về kết quả
  doc.fontSize(12)
     .fillColor('#333333')
     .text('Giải thích kết quả:', { underline: true });
  
  doc.moveDown(0.5);
  
  if (reportType === 'traditional') {
    if (score < 5) {
      doc.text('Không phát hiện dấu hiệu đạo văn đáng kể trong tài liệu. Tỷ lệ trùng lặp nằm trong mức có thể chấp nhận được đối với các trích dẫn thông thường.');
    } else if (score < 20) {
      doc.text('Phát hiện một số đoạn có dấu hiệu trùng lặp, nhưng ở mức độ thấp. Có thể là do trích dẫn, thuật ngữ chuyên ngành hoặc các cụm từ phổ biến. Tài liệu nhìn chung có tính độc đáo cao.');
    } else if (score < 50) {
      doc.text('Phát hiện mức độ trùng lặp trung bình. Một số đoạn văn có thể đã được sao chép từ các nguồn khác mà không trích dẫn đầy đủ. Khuyến nghị kiểm tra lại các phần được đánh dấu.');
    } else {
      doc.text('Phát hiện mức độ trùng lặp cao. Nhiều đoạn văn có dấu hiệu được sao chép từ các nguồn khác mà không có trích dẫn phù hợp. Cần xem xét lại tính nguyên bản của tài liệu.');
    }
  } else {
    if (score < 5) {
      doc.text('Không phát hiện dấu hiệu sử dụng công cụ AI trong tài liệu. Nội dung có đặc điểm của văn bản viết bởi con người.');
    } else if (score < 20) {
      doc.text('Phát hiện một số dấu hiệu nhẹ của việc sử dụng công cụ AI, nhưng ở mức độ thấp. Có thể chỉ một số câu hoặc đoạn văn ngắn được tạo bởi AI.');
    } else if (score < 50) {
      doc.text('Phát hiện mức độ trung bình của nội dung được tạo bởi AI. Một số đoạn văn có đặc điểm phong cách, cấu trúc câu và từ vựng đặc trưng của AI.');
    } else {
      doc.text('Phát hiện mức độ cao của nội dung được tạo bởi AI. Nhiều phần của tài liệu có dấu hiệu rõ ràng của việc sử dụng công cụ AI như ChatGPT hoặc tương tự.');
    }
  }
  
  doc.moveDown(2);
};

/**
 * Thêm chi tiết đạo văn truyền thống
 * @param {PDFDocument} doc - Tài liệu PDF
 * @param {Object} thesis - Thông tin luận văn
 * @param {Object} plagiarismResults - Kết quả phát hiện đạo văn
 */
const addTraditionalPlagiarismDetails = (doc, thesis, plagiarismResults) => {
  // Tiêu đề phần chi tiết
  doc.fontSize(14)
     .fillColor('#333333')
     .text('CHI TIẾT PHÁT HIỆN ĐẠO VĂN', { underline: true });
  
  doc.moveDown(1);
  
  // Nguồn tham khảo phát hiện được
  const sources = thesis.sources || [];
  if (sources.length > 0) {
    doc.fontSize(12)
       .fillColor('#333333')
       .text('Nguồn tài liệu trùng lặp:', { underline: true });
    
    doc.moveDown(0.5);
    
    // Danh sách nguồn
    sources
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10) // Giới hạn 10 nguồn hàng đầu
      .forEach((source, index) => {
        doc.fontSize(11)
           .fillColor('#555555')
           .text(`${index + 1}. ${source.title || 'Không xác định'}`, {
             continued: true,
             indent: 20
           });
        
        doc.fillColor('#0066CC')
           .text(` (${source.similarity}% trùng lặp)`);
        
        if (source.author) {
          doc.fillColor('#555555')
             .text(`   Tác giả: ${source.author}`, { indent: 30 });
        }
        
        doc.moveDown(0.2);
    });
    
    doc.moveDown(1);
  }
  
  // Các đoạn văn bản trùng lặp
  const textMatches = thesis.textMatches || [];
  if (textMatches.length > 0) {
    doc.fontSize(12)
       .fillColor('#333333')
       .text('Các đoạn văn bản trùng lặp:', { underline: true });
    
    doc.moveDown(0.5);
    
    // Hiển thị các đoạn trùng lặp
    textMatches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 15) // Giới hạn 15 đoạn trùng lặp hàng đầu
      .forEach((match, index) => {
        // Xác định màu dựa trên mức độ trùng lặp
        const highlightColor = match.similarity > 80 ? '#F44336' : 
                              match.similarity > 50 ? '#FF9800' : '#4CAF50';
        
        // Số trang nếu có
        const pageInfo = match.pageNumber ? ` (Trang ${match.pageNumber})` : '';
        
        // Tiêu đề đoạn trùng lặp
        doc.fontSize(11)
           .fillColor('#333333')
           .text(`Đoạn trùng lặp ${index + 1}:${pageInfo} - Độ tương đồng ${match.similarity}%`, {
             indent: 20
           });
        
        doc.moveDown(0.3);
        
        // Đoạn văn trong tài liệu
        doc.fontSize(10)
           .fillColor(highlightColor)
           .text('Trong luận văn:', { indent: 25, continued: true })
           .fillColor('#333333')
           .text(' (được làm nổi bật màu đỏ)');
        
        // Tạo hình chữ nhật làm nền cho đoạn trùng lặp
        const textY = doc.y;
        const textOptions = {
          width: doc.page.width - 150,
          align: 'left',
          indent: 30
        };
        
        const textHeight = doc.heightOfString(truncateText(match.thesisText, 300), textOptions);
        
        // Vẽ hình chữ nhật làm nền
        doc.rect(72 + 25, textY, doc.page.width - 150, textHeight)
           .fill('#FFEEEE');
        
        // Viết đoạn văn bản trùng lặp lên nền
        doc.fillColor('#333333')
           .text(truncateText(match.thesisText, 300), 72 + 25, textY, textOptions);
        
        doc.moveDown(0.5);
        
        // Đoạn văn trong nguồn
        doc.fontSize(10)
           .fillColor('#0066CC')
           .text('Trong nguồn:', { indent: 25 });
        
        doc.fillColor('#555555')
           .fontSize(9)
           .text(truncateText(match.sourceText, 300), {
             width: doc.page.width - 150,
             align: 'left',
             indent: 30
           });
        
        // Thông tin nguồn
        if (match.source) {
          doc.moveDown(0.3);
          doc.fontSize(9)
             .fillColor('#666666')
             .text(`Nguồn: ${match.source.title || 'Không xác định'}${match.source.author ? ` - ${match.source.author}` : ''}`, {
               indent: 30,
               width: doc.page.width - 150,
             });
        }
        
        doc.moveDown(1);
        
        // Thêm trang mới nếu còn không gian ít hơn 100 đơn vị
        if (doc.y > doc.page.height - 150 && index < textMatches.length - 1) {
          doc.addPage();
        }
      });
  } else {
    doc.fontSize(12)
       .fillColor('#555555')
       .text('Không tìm thấy đoạn văn bản trùng lặp đáng kể.');
  }
};

/**
 * Thêm chi tiết đạo văn AI
 * @param {PDFDocument} doc - Tài liệu PDF
 * @param {Object} thesis - Thông tin luận văn
 * @param {Object} plagiarismResults - Kết quả phát hiện đạo văn
 */
const addAIPlagiarismDetails = (doc, thesis, plagiarismResults) => {
  // Tiêu đề phần chi tiết
  doc.fontSize(14)
     .fillColor('#333333')
     .text('CHI TIẾT PHÁT HIỆN ĐẠO VĂN AI', { underline: true });
  
  doc.moveDown(1);
  
  // Phương pháp phát hiện
  doc.fontSize(12)
     .fillColor('#333333')
     .text('Phương pháp phát hiện:', { underline: true });
  
  doc.moveDown(0.5);
  
  doc.fontSize(11)
     .fillColor('#555555')
     .text('Hệ thống sử dụng kết hợp nhiều phương pháp để phát hiện nội dung được tạo bởi AI:', {
       width: doc.page.width - 150,
       align: 'left'
     });
  
  doc.moveDown(0.3);
  
  const methods = [
    'Phân tích độ đồng đều và cấu trúc câu',
    'Phát hiện các mẫu từ vựng và cụm từ đặc trưng của AI',
    'So sánh với mô hình ngôn ngữ GPT và các mô hình AI khác',
    'Phân tích độ đa dạng từ vựng và phong cách viết'
  ];
  
  methods.forEach(method => {
    doc.text(`• ${method}`, {
      width: doc.page.width - 150,
      align: 'left',
      indent: 20
    });
  });
  
  doc.moveDown(1);
  
  // Các đoạn văn có dấu hiệu tạo bởi AI
  const aiDetails = thesis.aiPlagiarismDetails || [];
  
  if (aiDetails.length > 0) {
    doc.fontSize(12)
       .fillColor('#333333')
       .text('Các đoạn văn có dấu hiệu được tạo bởi AI:', { underline: true });
    
    doc.moveDown(0.5);
    
    // Hiển thị các đoạn AI
    aiDetails
      .sort((a, b) => b.aiConfidence - a.aiConfidence)
      .slice(0, 15) // Giới hạn 15 đoạn hàng đầu
      .forEach((detail, index) => {
        // Xác định màu dựa trên mức độ tin cậy
        const highlightColor = detail.aiConfidence > 80 ? '#8E24AA' : 
                               detail.aiConfidence > 50 ? '#7B1FA2' : '#9C27B0';
        
        // Tính số trang
        const pageNumber = calculatePageNumber(thesis.content, detail.startIndex);
        
        // Tiêu đề đoạn AI
        doc.fontSize(11)
           .fillColor('#333333')
           .text(`Đoạn ${index + 1}: (Trang ${pageNumber}) - Độ tin cậy ${detail.aiConfidence}%`, {
             indent: 20
           });
        
        doc.moveDown(0.3);
        
        // Tạo hình chữ nhật làm nền cho đoạn AI
        const textY = doc.y;
        const textOptions = {
          width: doc.page.width - 150,
          align: 'left',
          indent: 30
        };
        
        let displayText = detail.matchedText;
        if (displayText.length > 400) {
          displayText = displayText.substring(0, 400) + '...';
        }
        
        const textHeight = doc.heightOfString(displayText, textOptions);
        
        // Vẽ hình chữ nhật làm nền
        doc.rect(72 + 25, textY, doc.page.width - 150, textHeight)
           .fill('#F3E5F5');
        
        // Viết đoạn văn bản AI lên nền
        doc.fillColor('#333333')
           .text(displayText, 72 + 25, textY, textOptions);
        
        doc.moveDown(0.5);
        
        // Phân tích đặc điểm AI
        doc.fontSize(10)
           .fillColor('#7B1FA2')
           .text('Đặc điểm phát hiện:', { indent: 25 });
        
        // Tạo một vài đặc điểm AI mẫu dựa trên độ tin cậy
        const features = [];
        
        if (detail.aiConfidence > 70) {
          features.push('Cấu trúc câu quá đồng đều và hoàn chỉnh');
          features.push('Sử dụng từ vựng học thuật phức tạp một cách nhất quán');
          features.push('Thiếu các đặc điểm ngôn ngữ tự nhiên và khuyết thiếu');
        } else if (detail.aiConfidence > 50) {
          features.push('Sử dụng các cụm từ chuyển tiếp phổ biến của AI');
          features.push('Độ đa dạng từ vựng cao bất thường');
        } else {
          features.push('Một số mẫu câu có dấu hiệu do AI tạo ra');
        }
        
        features.forEach(feature => {
          doc.fillColor('#555555')
             .fontSize(9)
             .text(`• ${feature}`, {
               indent: 30,
               width: doc.page.width - 150,
             });
        });
        
        doc.moveDown(1);
        
        // Thêm trang mới nếu còn không gian ít hơn 150 đơn vị
        if (doc.y > doc.page.height - 150 && index < aiDetails.length - 1) {
          doc.addPage();
        }
      });
  } else {
    doc.fontSize(12)
       .fillColor('#555555')
       .text('Không tìm thấy đoạn văn bản nào có dấu hiệu được tạo bởi AI.');
  }
  
  doc.moveDown(1);
  
  // Thêm lưu ý về phát hiện AI
  doc.fontSize(11)
     .fillColor('#333333')
     .text('Lưu ý:', { underline: true });
  
  doc.moveDown(0.3);
  
  doc.fillColor('#555555')
     .fontSize(10)
     .text('Việc phát hiện nội dung được tạo bởi AI vẫn đang trong giai đoạn phát triển và có thể cho kết quả dương tính giả hoặc âm tính giả. Kết quả chỉ nên được sử dụng như một hướng dẫn và cần được đánh giá cùng với các yếu tố khác.');
};

/**
 * Thêm chân trang
 * @param {PDFDocument} doc - Tài liệu PDF
 */
const addFooter = (doc) => {
  // Lấy số trang hiện tại
  const totalPages = doc.bufferedPageRange().count;
  
  // Thêm số trang vào mỗi trang
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    
    // Thêm đường kẻ chân trang
    doc.moveTo(72, pageHeight - 50)
       .lineTo(pageWidth - 72, pageHeight - 50)
       .stroke('#CCCCCC');
    
    // Thêm số trang
    doc.fontSize(10)
       .fillColor('#999999')
       .text(
          `Trang ${i + 1} / ${totalPages}`,
          72,
          pageHeight - 40,
          { align: 'center', width: pageWidth - 144 }
       );
    
    // Thêm thông tin copyright
    const currentDate = new Date().toLocaleDateString('vi-VN');
    doc.text(
      `Báo cáo được tạo bởi ThesisGuard - ${currentDate}`,
      72,
      pageHeight - 30,
      { align: 'center', width: pageWidth - 144 }
    );
  }
};

/**
 * Định dạng kích thước file thành dạng dễ đọc
 * @param {number} size - Kích thước file (byte)
 * @returns {string} - Kích thước đã được định dạng
 */
const formatFileSize = (size) => {
  if (!size) return 'Không xác định';
  
  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`;
  }
  
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

/**
 * Cắt ngắn văn bản nếu quá dài
 * @param {string} text - Văn bản cần cắt ngắn
 * @param {number} maxLength - Độ dài tối đa
 * @returns {string} - Văn bản đã cắt ngắn
 */
const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

module.exports = {
  generatePlagiarismReport
};