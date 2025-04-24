/**
 * fileConverter.js
 * Module cung cấp các công cụ để chuyển đổi các loại file khác nhau sang định dạng PDF
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const mammoth = require('mammoth');
const http = require('http');
const https = require('https');
const { PDFDocument, rgb } = require('pdf-lib');
const { getFileFromMinIO } = require('./minioUploader');

/**
 * Tải file từ MinIO về máy chủ cục bộ để xử lý
 * @param {string} objectName - Tên đối tượng trong MinIO
 * @param {string} tempDir - Thư mục tạm để lưu file
 * @returns {Promise<string>} - Đường dẫn đến file tạm
 */
const downloadFileFromMinIO = async (objectName, tempDir = 'uploads/temp') => {
  // Đảm bảo thư mục tạm tồn tại
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const result = await getFileFromMinIO(objectName);
  
  if (!result.success) {
    throw new Error('Không thể lấy file từ MinIO');
  }
  
  // Tạo tên file tạm có đuôi giống với file gốc
  const fileExtension = path.extname(objectName);
  const tempFilePath = path.join(tempDir, `temp-${Date.now()}${fileExtension}`);
  
  // Tải file về
  await new Promise((resolve, reject) => {
    const fileUrl = new URL(result.url);
    const requestLib = fileUrl.protocol === 'https:' ? https : http;
    
    const fileStream = fs.createWriteStream(tempFilePath);
    const request = requestLib.get(result.url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Lỗi khi tải file: ${response.statusCode}`));
        return;
      }
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(tempFilePath, () => {});
      reject(err);
    });
    
    fileStream.on('error', (err) => {
      fs.unlink(tempFilePath, () => {});
      reject(err);
    });
  });
  
  return tempFilePath;
};

/**
 * Xác định loại file từ mimetype
 * @param {string} mimetype - Loại MIME của file
 * @returns {string} - Loại file (pdf, docx, doc, txt, v.v.)
 */
const getFileType = (mimetype) => {
  switch (mimetype) {
    case 'application/pdf':
      return 'pdf';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'application/msword':
      return 'doc';
    case 'text/plain':
      return 'txt';
    case 'text/html':
    case 'application/xhtml+xml':
      return 'html';
    default:
      return 'unknown';
  }
};

/**
 * Chuyển đổi file DOCX sang PDF
 * @param {string} inputPath - Đường dẫn đến file DOCX
 * @returns {Promise<string>} - Đường dẫn đến file PDF đã chuyển đổi
 */
const convertDocxToPdf = async (inputPath) => {
  const outputPath = inputPath.replace(/\.docx$/, '.pdf');
  
  try {
    // Đọc nội dung DOCX sang HTML
    const result = await mammoth.convertToHtml({ path: inputPath });
    const html = result.value;
    
    // Tạo file HTML tạm thời
    const htmlPath = inputPath.replace(/\.docx$/, '.html');
    fs.writeFileSync(htmlPath, `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Converted Document</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `);
    
    // Sử dụng thư viện để chuyển đổi HTML sang PDF
    const htmlPdf = require('html-pdf');
    
    await new Promise((resolve, reject) => {
      htmlPdf.create(fs.readFileSync(htmlPath, 'utf8'), {
        format: 'A4',
        border: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      }).toFile(outputPath, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
    
    // Xóa file HTML tạm thời
    fs.unlinkSync(htmlPath);
    
    return outputPath;
  } catch (error) {
    console.error('Lỗi khi chuyển đổi DOCX sang PDF:', error);
    throw new Error('Không thể chuyển đổi DOCX sang PDF');
  }
};

/**
 * Chuyển đổi file TXT sang PDF
 * @param {string} inputPath - Đường dẫn đến file TXT
 * @returns {Promise<string>} - Đường dẫn đến file PDF đã chuyển đổi
 */
const convertTxtToPdf = async (inputPath) => {
  const outputPath = inputPath.replace(/\.txt$/, '.pdf');
  
  try {
    // Đọc nội dung file txt
    const text = fs.readFileSync(inputPath, 'utf8');
    
    // Tạo file HTML tạm thời
    const htmlPath = inputPath.replace(/\.txt$/, '.html');
    fs.writeFileSync(htmlPath, `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Converted Document</title>
        <style>
          body { font-family: monospace; margin: 20px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        ${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </body>
      </html>
    `);
    
    // Sử dụng thư viện để chuyển đổi HTML sang PDF
    const htmlPdf = require('html-pdf');
    
    await new Promise((resolve, reject) => {
      htmlPdf.create(fs.readFileSync(htmlPath, 'utf8'), {
        format: 'A4',
        border: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      }).toFile(outputPath, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
    
    // Xóa file HTML tạm thời
    fs.unlinkSync(htmlPath);
    
    return outputPath;
  } catch (error) {
    console.error('Lỗi khi chuyển đổi TXT sang PDF:', error);
    throw new Error('Không thể chuyển đổi TXT sang PDF');
  }
};

/**
 * Chuyển đổi file HTML sang PDF
 * @param {string} inputPath - Đường dẫn đến file HTML
 * @returns {Promise<string>} - Đường dẫn đến file PDF đã chuyển đổi
 */
const convertHtmlToPdf = async (inputPath) => {
  const outputPath = inputPath.replace(/\.(html|htm)$/, '.pdf');
  
  try {
    // Sử dụng thư viện để chuyển đổi HTML sang PDF
    const htmlPdf = require('html-pdf');
    const content = fs.readFileSync(inputPath, 'utf8');
    
    await new Promise((resolve, reject) => {
      htmlPdf.create(content, {
        format: 'A4',
        border: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      }).toFile(outputPath, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
    
    return outputPath;
  } catch (error) {
    console.error('Lỗi khi chuyển đổi HTML sang PDF:', error);
    throw new Error('Không thể chuyển đổi HTML sang PDF');
  }
};

/**
 * Chuyển đổi bất kỳ file nào sang PDF
 * @param {string} objectName - Tên đối tượng trong MinIO
 * @param {string} mimetype - Loại MIME của file
 * @returns {Promise<Object>} - Thông tin về file PDF đã chuyển đổi
 */
const convertToPdf = async (objectName, mimetype) => {
  try {
    const fileType = getFileType(mimetype);
    
    // Nếu đã là PDF, không cần chuyển đổi
    if (fileType === 'pdf') {
      const tempFilePath = await downloadFileFromMinIO(objectName);
      return {
        success: true,
        filePath: tempFilePath,
        originalType: fileType,
        converted: false
      };
    }
    
    // Tải file từ MinIO
    const tempFilePath = await downloadFileFromMinIO(objectName);
    let pdfPath;
    
    // Chuyển đổi file tùy theo loại
    switch (fileType) {
      case 'docx':
        pdfPath = await convertDocxToPdf(tempFilePath);
        break;
      case 'txt':
        pdfPath = await convertTxtToPdf(tempFilePath);
        break;
      case 'html':
        pdfPath = await convertHtmlToPdf(tempFilePath);
        break;
      default:
        throw new Error(`Không hỗ trợ chuyển đổi file loại ${fileType} sang PDF`);
    }
    
    // Xóa file tạm thời ban đầu
    fs.unlinkSync(tempFilePath);
    
    return {
      success: true,
      filePath: pdfPath,
      originalType: fileType,
      converted: true
    };
  } catch (error) {
    console.error('Lỗi khi chuyển đổi file sang PDF:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Highlight phần đạo văn trong file PDF
 * @param {string} pdfPath - Đường dẫn đến file PDF
 * @param {Array} plagiarismDetails - Thông tin về các đoạn đạo văn
 * @returns {Promise<string>} - Đường dẫn đến file PDF đã được highlight
 */
const highlightPlagiarismInPdf = async (pdfPath, plagiarismDetails) => {
  try {
    if (!plagiarismDetails || plagiarismDetails.length === 0) {
      return pdfPath; // Không có đạo văn để highlight
    }
    
    // Đọc file PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Tạo file PDF mới với highlighting
    const pages = pdfDoc.getPages();
    
    // Trích xuất và highlight đoạn văn bản đạo văn
    // Lưu ý: Đây là một tác vụ phức tạp và giới hạn ở mức cơ bản
    // PDF-lib có thể không hỗ trợ đầy đủ việc highlight text
    // Cần thêm thư viện xử lý PDF cao cấp hơn để làm tốt hơn
    
    // Mục đích demo: Chỉ highlight trang đầu tiên
    if (pages.length > 0) {
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      // Vẽ một hình chữ nhật màu đỏ nhạt để mô phỏng việc highlight
      firstPage.drawRectangle({
        x: 50,
        y: 50,
        width: width - 100,
        height: 100,
        color: rgb(1, 0, 0, 0.2), // Màu đỏ với độ trong suốt
      });
      
      // Thêm chú thích "Phát hiện đạo văn" ở gần khu vực highlight
      firstPage.drawText('Phát hiện đạo văn', {
        x: 50,
        y: 160,
        size: 12,
        color: rgb(1, 0, 0),
      });
    }
    
    // Lưu file PDF đã highlight
    const highlightedPdfBytes = await pdfDoc.save();
    const highlightedPdfPath = pdfPath.replace('.pdf', '-highlighted.pdf');
    fs.writeFileSync(highlightedPdfPath, highlightedPdfBytes);
    
    return highlightedPdfPath;
  } catch (error) {
    console.error('Lỗi khi highlight đạo văn trong PDF:', error);
    return pdfPath; // Trả về file PDF gốc nếu có lỗi
  }
};

module.exports = {
  convertToPdf,
  highlightPlagiarismInPdf,
  downloadFileFromMinIO
};