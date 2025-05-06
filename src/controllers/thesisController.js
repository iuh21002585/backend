const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const https = require('https');
const http = require('http');
const Thesis = require('../models/Thesis');
const Config = require('../models/configModel');
const { 
  getFileFromStorage, 
  downloadFromStorage, 
  deleteFileFromStorage, 
  STORAGE_PROVIDER 
} = require('../utils/storageManager');
const { detectPlagiarism } = require('../services/plagiarismService');

// @desc    Tải lên luận văn mới
// @route   POST /api/theses/upload
// @access  Private
const uploadThesis = async (req, res) => {
  // Kiểm tra xem đã có file được upload qua middleware
  const uploadedFile = req.b2File;
  
  if (!uploadedFile) {
    return res.status(400).json({
      success: false,
      message: 'Không tìm thấy file được tải lên. Vui lòng thử lại.',
      error: 'No file uploaded'
    });
  }

  try {
    const { originalname, size, mimetype, objectName, url } = uploadedFile;
    const { title, faculty, abstract } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false, 
        message: 'Vui lòng nhập tiêu đề luận văn',
        error: 'Missing title'
      });
    }

    // Tạo đối tượng Thesis và lưu thông tin cơ bản
    const thesis = new Thesis({ 
      title, 
      user: req.user._id, 
      faculty: faculty || 'Chưa phân loại', 
      abstract: abstract || '', 
      filePath: objectName,
      fileName: originalname,
      fileSize: size,
      fileType: mimetype,
      status: 'pending',
      storageProvider: STORAGE_PROVIDER // Lưu thông tin nhà cung cấp lưu trữ
    });

    // Xử lý nội dung tùy theo loại file
    if (mimetype === 'application/pdf') {
      try {
        // Sử dụng downloadFromStorage thay vì tự xử lý HTTP request
        console.log(`Đang tải file PDF từ ${STORAGE_PROVIDER}: ${objectName}`);
        
        // Đảm bảo thư mục temp tồn tại
        if (!fs.existsSync('uploads/temp')) {
          fs.mkdirSync('uploads/temp', { recursive: true });
        }
        
        const tempFilePath = path.join('uploads/temp', `temp-${Date.now()}.pdf`);
        
        // Sử dụng phương thức downloadFromStorage để tải về file
        const downloadResult = await downloadFromStorage(objectName, tempFilePath);
        
        if (!downloadResult.success) {
          console.error(`Lỗi tải file từ ${STORAGE_PROVIDER}:`, downloadResult.error);
          // Tiếp tục mà không trích xuất nội dung
          thesis.content = `Không thể tải file từ ${STORAGE_PROVIDER} để trích xuất nội dung`;
          thesis.extractionError = true;
        } else {
          try {
            // Đọc nội dung PDF
            const pdfBuffer = fs.readFileSync(tempFilePath);
            const pdfData = await pdfParse(pdfBuffer);
            
            // Lưu nội dung text
            thesis.content = pdfData.text;
            thesis.pageCount = pdfData.numpages;
            
            // Xóa file tạm sau khi đã xử lý
            fs.unlinkSync(tempFilePath);
          } catch (error) {
            console.error('Lỗi khi đọc PDF:', error);
            thesis.content = 'Không thể trích xuất nội dung';
            thesis.extractionError = true;
            
            // Xóa file tạm nếu tồn tại
            if (fs.existsSync(tempFilePath)) {
              try {
                fs.unlinkSync(tempFilePath);
              } catch (e) {
                console.error('Lỗi khi xóa file tạm:', e);
              }
            }
          }
        }
      } catch (error) {
        console.error('Lỗi khi xử lý file PDF:', error);
        thesis.content = 'Lỗi khi xử lý file';
        thesis.extractionError = true;
      }
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        console.log(`Đang tải file DOCX từ ${STORAGE_PROVIDER}: ${objectName}`);
        
        // Đảm bảo thư mục temp tồn tại
        if (!fs.existsSync('uploads/temp')) {
          fs.mkdirSync('uploads/temp', { recursive: true });
        }
        
        const tempFilePath = path.join('uploads/temp', `temp-${Date.now()}.docx`);
        
        // Sử dụng phương thức downloadFromStorage để tải về file
        const downloadResult = await downloadFromStorage(objectName, tempFilePath);
        
        if (!downloadResult.success) {
          console.error(`Lỗi tải file từ ${STORAGE_PROVIDER}:`, downloadResult.error);
          throw new Error(`Không thể tải file từ ${STORAGE_PROVIDER}: ${downloadResult.error}`);
        }
        
        // Đọc nội dung DOCX
        const docxBuf = fs.readFileSync(tempFilePath);
        const docxData = await mammoth.extractRawText({buffer: docxBuf});
        
        // Lưu nội dung text
        thesis.content = docxData.value;
        
        // Xóa file tạm sau khi đã xử lý
        fs.unlinkSync(tempFilePath);
      } catch (error) {
        console.error('Lỗi khi đọc DOCX:', error);
        thesis.content = 'Không thể trích xuất nội dung';
        thesis.extractionError = true;
        
        // Define tempFilePath here to ensure it's available in the error handler scope
        // If it's not defined in the try block, initialize it as null
        const tempFilePath = path.join('uploads/temp', `temp-${Date.now()}.docx`);
        
        // Xóa file tạm nếu tồn tại
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log(`Đã xóa file tạm ${tempFilePath} sau khi xử lý lỗi`);
          }
        } catch (e) {
          console.error('Lỗi khi xóa file tạm:', e);
        }
      }
    } else {
      // Đối với các loại file khác, ghi chú rằng nội dung không thể trích xuất trực tiếp
      thesis.content = `Nội dung không thể trích xuất tự động từ định dạng ${mimetype}`;
      thesis.extractionError = true;
    }

    // Lưu luận văn vào cơ sở dữ liệu
    const createdThesis = await thesis.save();
    
    if (createdThesis) {
      // Sử dụng Promise và async/await để xử lý kiểm tra đạo văn không đồng bộ
      // Không chờ quá trình hoàn thành để trả về response sớm cho người dùng
      Promise.resolve().then(async () => {
        try {
          // Cập nhật trạng thái
          createdThesis.status = 'processing';
          await createdThesis.save();
          console.log(`Bắt đầu kiểm tra đạo văn cho luận văn: ${createdThesis._id}`);
          
          // Lấy giá trị checkAiPlagiarism và checkTraditionalPlagiarism từ request
          const checkAiPlagiarism = req.body.checkAiPlagiarism === 'true';
          const checkTraditionalPlagiarism = req.body.checkTraditionalPlagiarism === 'true';
          
          // Gọi dịch vụ phát hiện đạo văn
          const plagiarismResults = await detectPlagiarism(createdThesis._id, checkAiPlagiarism, checkTraditionalPlagiarism);
          
          // Lấy phiên bản mới nhất của thesis từ cơ sở dữ liệu để tránh lỗi VersionError
          const updatedThesis = await Thesis.findById(createdThesis._id);
          
          if (!updatedThesis) {
            throw new Error(`Không thể tìm thấy luận văn với ID: ${createdThesis._id}`);
          }
          
          // Cập nhật kết quả
          updatedThesis.status = 'completed';
          updatedThesis.plagiarismScore = plagiarismResults.plagiarismScore || 0;
          updatedThesis.aiPlagiarismScore = plagiarismResults.aiPlagiarismScore || 0;
          updatedThesis.plagiarismDetails = plagiarismResults.plagiarismDetails || [];
          updatedThesis.aiPlagiarismDetails = plagiarismResults.aiPlagiarismDetails || [];
          updatedThesis.sources = plagiarismResults.sources || [];
          updatedThesis.textMatches = plagiarismResults.textMatches || [];

          // Kiểm tra ngưỡng đạo văn tối đa từ cấu hình
          try {
            const maxPlagiarismConfig = await Config.findOne({ key: 'maxPlagiarismPercentage' });
            const maxPlagiarismPercentage = maxPlagiarismConfig ? maxPlagiarismConfig.value : 30; // Mặc định 30% nếu không có cấu hình
            
            // Kiểm tra nếu tỷ lệ đạo văn vượt quá ngưỡng
            if (updatedThesis.plagiarismScore > maxPlagiarismPercentage) {
              updatedThesis.status = 'rejected';
              console.log(`Luận văn đã bị từ chối vì tỷ lệ đạo văn (${updatedThesis.plagiarismScore}%) vượt quá ngưỡng cho phép (${maxPlagiarismPercentage}%)`);
            }
          } catch (error) {
            console.error('Lỗi khi kiểm tra ngưỡng đạo văn:', error);
            // Không thay đổi trạng thái nếu xảy ra lỗi khi kiểm tra
          }

          await updatedThesis.save();
          console.log(`Đã hoàn thành kiểm tra đạo văn cho luận văn: ${updatedThesis._id}`);
        } catch (error) {
          console.error('Lỗi khi phân tích đạo văn:', error);
          // Cập nhật trạng thái lỗi nếu có vấn đề - quan trọng: lấy phiên bản mới nhất
          const errorThesis = await Thesis.findById(createdThesis._id);
          if (errorThesis) {
            errorThesis.status = 'completed';
            errorThesis.extractionError = true;
            await errorThesis.save();
          }
        }
      }).catch(error => {
        console.error('Lỗi không mong muốn trong quá trình phát hiện đạo văn:', error);
      });

      return res.status(201).json({
        success: true,
        _id: createdThesis._id,
        title: createdThesis.title,
        fileName: createdThesis.fileName,
        status: createdThesis.status,
        message: 'Tải lên thành công. Đang xử lý kiểm tra đạo văn...',
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu luận văn không hợp lệ',
        error: 'Invalid thesis data'
      });
    }
  } catch (error) {
    console.error('Lỗi khi tải lên luận văn:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xử lý file',
      error: error.message,
    });
  }
};

// @desc    Lấy danh sách luận văn của người dùng hiện tại
// @route   GET /api/theses
// @access  Private
const getMyTheses = async (req, res) => {
  const theses = await Thesis.find({ user: req.user._id })
    .select('-content -plagiarismDetails -aiPlagiarismDetails')
    .sort({ createdAt: -1 });
  
  res.json(theses);
};

// @desc    Lấy chi tiết luận văn theo ID
// @route   GET /api/theses/:id
// @access  Private
const getThesisById = async (req, res) => {
  try {
    // Sử dụng populate để lấy thông tin của author
    const thesis = await Thesis.findById(req.params.id).populate('user', 'name email');

    if (!thesis) {
      return res.status(404).json({
        message: 'Không tìm thấy luận văn'
      });
    }

    // Kiểm tra nếu người dùng là chủ sở hữu hoặc admin
    if (thesis.user?._id && thesis.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({
        message: 'Bạn không có quyền xem luận văn này'
      });
    }

    // Chuyển đổi sang định dạng phù hợp cho frontend
    const formattedThesis = {
      ...thesis.toObject(),
      author: thesis.user ? {
        _id: thesis.user._id,
        name: thesis.user.name
      } : null
    };

    return res.json(formattedThesis);
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết luận văn:', error);
    return res.status(500).json({
      message: 'Đã xảy ra lỗi khi lấy chi tiết luận văn',
      error: error.message
    });
  }
};

// @desc    Lấy file của luận văn
// @route   GET /api/theses/file/:objectName
// @access  Private
const getThesisFile = async (req, res) => {
  try {
    const objectName = req.params.objectName;
    
    // Kiểm tra quyền truy cập
    const thesis = await Thesis.findOne({ filePath: objectName });
    
    if (!thesis) {
      res.status(404);
      throw new Error('Không tìm thấy file luận văn');
    }
    
    // Kiểm tra quyền sở hữu
    if (thesis.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      res.status(403);
      throw new Error('Bạn không có quyền truy cập file này');
    }
    
    // Lấy URL tạm thời từ Storage
    const result = await getFileFromStorage(objectName);
    
    if (!result.success) {
      res.status(500);
      throw new Error(`Không thể lấy file từ ${thesis.storageProvider || STORAGE_PROVIDER}`);
    }
    
    // Redirect đến URL tạm thời
    res.redirect(result.url);
  } catch (error) {
    console.error('Lỗi khi lấy file luận văn:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy file luận văn',
      error: error.message,
    });
  }
};

// @desc    Tải xuống file của luận văn
// @route   GET /api/theses/download/:id
// @access  Private
const downloadThesis = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.id);
    
    if (!thesis) {
      res.status(404);
      throw new Error('Không tìm thấy luận văn');
    }
    
    // Kiểm tra nếu người dùng là chủ sở hữu hoặc admin
    if (thesis.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      res.status(403);
      throw new Error('Bạn không có quyền tải xuống luận văn này');
    }
    
    if (!thesis.filePath) {
      res.status(404);
      throw new Error('Không tìm thấy file luận văn');
    }
    
    // Lấy presigned URL từ Storage
    const result = await getFileFromStorage(thesis.filePath);
    
    if (!result.success) {
      res.status(500);
      throw new Error('Không thể truy cập file');
    }
    
    // Điều hướng người dùng tới URL tải xuống
    res.redirect(result.url);
  } catch (error) {
    console.error('Lỗi khi tải xuống luận văn:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Đã xảy ra lỗi khi tải xuống file'
    });
  }
};

// @desc    Tải xuống báo cáo đạo văn có highlight
// @route   GET /api/theses/report/:id/:type
// @access  Private
const downloadPlagiarismReport = async (req, res) => {
  try {
    // Xác định ID luận văn
    const thesisId = req.params.id;
    
    // Nếu không có ID hợp lệ, trả về lỗi
    if (!thesisId) {
      res.status(400);
      throw new Error('ID luận văn không hợp lệ');
    }
    
    const thesis = await Thesis.findById(thesisId);
    
    if (!thesis) {
      res.status(404);
      throw new Error('Không tìm thấy luận văn');
    }
    
    // Kiểm tra quyền truy cập nếu người dùng đã đăng nhập
    if (req.user) {
      if (thesis.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
        res.status(403);
        throw new Error('Bạn không có quyền tải xuống báo cáo này');
      }
    } else {
      console.log(`Đang truy cập báo cáo ${req.params.id} không có thông tin xác thực`);
    }
    
    // Xác định loại báo cáo (truyền thống hoặc AI)
    const reportType = req.params.type === 'ai' ? 'ai' : 'traditional';
    
    // Lấy thông tin báo cáo từ thesis
    const reportPath = reportType === 'ai' 
      ? thesis.aiPlagiarismReportPath 
      : thesis.plagiarismReportPath;
      
    console.log(`Thông tin báo cáo cho thesis ${thesisId}, loại: ${reportType}`);
    console.log(`Path báo cáo từ database: ${reportPath}`);
    
    if (!reportPath) {
      console.error(`Không tìm thấy path báo cáo trong database cho luận văn ${thesisId}, loại: ${reportType}`);
      return res.status(404).json({
        message: `Không tìm thấy báo cáo ${reportType === 'ai' ? 'AI' : 'truyền thống'} cho luận văn này. Vui lòng kiểm tra lại đạo văn để tạo báo cáo.`,
        errorType: 'REPORT_NOT_FOUND',
        success: false
      });
    }
    
    console.log(`Đang tải báo cáo ${reportType} từ đường dẫn: ${reportPath}`);
    
    // Lấy dữ liệu file từ Storage
    const result = await downloadFromStorage(reportPath);
    
    if (!result.success) {
      console.error(`Lỗi khi truy cập báo cáo từ storage: ${result.error || 'Không xác định'}`);
      return res.status(500).json({
        message: 'Không thể truy cập file báo cáo. Vui lòng thử lại sau hoặc liên hệ quản trị viên.',
        errorType: 'STORAGE_ACCESS_ERROR',
        success: false
      });
    }
    
    // Tạo tên file dễ đọc cho người dùng
    const fileName = `Bao-cao-dao-van-${reportType === 'ai' ? 'AI' : 'truyen-thong'}-${thesis.title.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    
    // Set headers để báo cho trình duyệt đây là file cần tải xuống
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', result.contentType || 'application/pdf');
    
    // Gửi dữ liệu trực tiếp tới client
    res.send(result.data);
    
  } catch (error) {
    console.error('Lỗi khi tải xuống báo cáo đạo văn:', error);
    const statusCode = error.statusCode || 500;
    
    // Kiểm tra xem response đã gửi hay chưa
    if (!res.headersSent) {
      return res.status(statusCode).json({
        message: error.message || 'Đã xảy ra lỗi khi tải xuống báo cáo',
        error: true,
        errorType: error.name || 'UNKNOWN_ERROR'
      });
    }
  }
};

// @desc    Xóa luận văn
// @route   DELETE /api/theses/:id
// @access  Private
const deleteThesis = async (req, res) => {
  try {
    console.log(`Đang cố gắng xóa luận văn ID: ${req.params.id}`);
    console.log(`User ID đang thực hiện: ${req.user._id}, isAdmin: ${req.user.isAdmin}`);
    
    const thesis = await Thesis.findById(req.params.id);
    
    if (!thesis) {
      console.log(`Không tìm thấy luận văn ID: ${req.params.id}`);
      res.status(404);
      throw new Error('Không tìm thấy luận văn');
    }
    
    console.log(`Thông tin luận văn: ${thesis._id}, author: ${thesis.user}`);
    
    // Kiểm tra nếu người dùng là chủ sở hữu hoặc admin
    if (thesis.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      console.log(`Không có quyền xóa: User ${req.user._id} không phải là chủ sở hữu ${thesis.user}`);
      res.status(403);
      throw new Error('Bạn không có quyền xóa luận văn này');
    }

    // Xóa file trên Storage
    try {
      console.log(`Chuẩn bị xóa file từ storage: ${thesis.filePath}`);
      const result = await deleteFileFromStorage(thesis.filePath);
      
      if (!result.success) {
        console.error('Cảnh báo: Không thể xóa file từ storage:', result.error);
        // Tiếp tục xử lý xóa luận văn ngay cả khi không xóa được file
      } else {
        console.log('Đã xóa file từ storage thành công');
      }
    } catch (storageError) {
      console.error('Lỗi nghiêm trọng khi giao tiếp với storage:', storageError);
      // Vẫn tiếp tục xóa luận văn trong cơ sở dữ liệu
    }

    console.log('Chuẩn bị xóa luận văn khỏi cơ sở dữ liệu');
    await thesis.deleteOne();
    console.log(`Đã xóa luận văn ID: ${req.params.id} thành công`);
    
    res.json({ message: 'Luận văn đã bị xóa' });
  } catch (error) {
    console.error('Lỗi khi xóa luận văn:', error);
    res.status(error.statusCode || 500);
    throw error;
  }
};

// @desc    Lấy tất cả luận văn (chỉ dành cho admin)
// @route   GET /api/theses/admin/all
// @access  Private/Admin
const getAllTheses = async (req, res) => {
  try {
    const theses = await Thesis.find({})
      .select('-content -plagiarismDetails -aiPlagiarismDetails')
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(theses);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách luận văn:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy danh sách luận văn',
      error: error.message,
    });
  }
};

// @desc    Cập nhật trạng thái luận văn
// @route   PUT /api/theses/:id/status
// @access  Private/Admin
const updateThesisStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['pending', 'processing', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }
    
    const thesis = await Thesis.findById(req.params.id);
    
    if (!thesis) {
      return res.status(404).json({ message: 'Không tìm thấy luận văn' });
    }
    
    thesis.status = status;
    await thesis.save();
    
    res.json({ message: 'Đã cập nhật trạng thái luận văn', thesis });
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái luận văn:', error);
    res.status(500).json({
      message: 'Lỗi khi cập nhật trạng thái luận văn',
      error: error.message,
    });
  }
};

// @desc    Cập nhật điểm đạo văn của luận văn
// @route   PUT /api/theses/:id/plagiarism
// @access  Private/Admin
const updatePlagiarismScore = async (req, res) => {
  try {
    const { plagiarismScore, aiPlagiarismScore, sources, textMatches, recheck } = req.body;
    
    const thesis = await Thesis.findById(req.params.id);
    
    if (!thesis) {
      return res.status(404).json({ message: 'Không tìm thấy luận văn' });
    }
    
    // Nếu yêu cầu kiểm tra lại
    if (recheck === true) {
      // Cập nhật trạng thái
      thesis.status = 'processing';
      await thesis.save();
      
      // Thực hiện kiểm tra lại
      const checkAiPlagiarism = req.body.checkAiPlagiarism === undefined ? true : req.body.checkAiPlagiarism;
      const checkTraditionalPlagiarism = req.body.checkTraditionalPlagiarism === undefined ? true : req.body.checkTraditionalPlagiarism;
      
      // Gọi service phát hiện đạo văn
      try {
        const plagiarismResults = await detectPlagiarism(thesis._id, checkAiPlagiarism, checkTraditionalPlagiarism);
        
        // Cập nhật kết quả
        thesis.plagiarismScore = plagiarismResults.plagiarismScore;
        thesis.aiPlagiarismScore = plagiarismResults.aiPlagiarismScore;
        thesis.plagiarismDetails = plagiarismResults.plagiarismDetails || [];
        thesis.aiPlagiarismDetails = plagiarismResults.aiPlagiarismDetails || [];
        thesis.sources = plagiarismResults.sources || [];
        thesis.textMatches = plagiarismResults.textMatches || [];
        thesis.status = 'completed';
        thesis.extractionError = false;
        
        await thesis.save();
        
        return res.json({ 
          message: 'Đã thực hiện kiểm tra đạo văn lại cho luận văn', 
          thesis 
        });
      } catch (error) {
        console.error('Lỗi khi kiểm tra đạo văn lại:', error);
        thesis.status = 'completed';
        thesis.extractionError = true;
        await thesis.save();
        
        return res.status(500).json({
          message: 'Lỗi khi kiểm tra đạo văn lại',
          error: error.message,
        });
      }
    }
    
    // Cập nhật thủ công nếu không yêu cầu kiểm tra lại
    if (plagiarismScore !== undefined) {
      thesis.plagiarismScore = plagiarismScore;
    }
    
    if (aiPlagiarismScore !== undefined) {
      thesis.aiPlagiarismScore = aiPlagiarismScore;
    }
    
    if (sources) {
      thesis.sources = sources;
    }
    
    if (textMatches) {
      thesis.textMatches = textMatches;
    }
    
    // Tự động cập nhật trạng thái thành 'completed' nếu đang ở trạng thái 'processing'
    if (thesis.status === 'processing') {
      thesis.status = 'completed';
    }
    
    // Kiểm tra ngưỡng đạo văn tối đa từ cấu hình
    try {
      const maxPlagiarismConfig = await Config.findOne({ key: 'maxPlagiarismPercentage' });
      const maxPlagiarismPercentage = maxPlagiarismConfig ? maxPlagiarismConfig.value : 30; // Mặc định 30% nếu không có cấu hình
      
      // Kiểm tra nếu tỷ lệ đạo văn vượt quá ngưỡng
      if (thesis.plagiarismScore > maxPlagiarismPercentage) {
        thesis.status = 'rejected';
        console.log(`Luận văn đã bị từ chối vì tỷ lệ đạo văn (${thesis.plagiarismScore}%) vượt quá ngưỡng cho phép (${maxPlagiarismPercentage}%)`);
      } else if (thesis.status === 'rejected' && thesis.plagiarismScore <= maxPlagiarismPercentage) {
        // Nếu đã bị từ chối trước đó nhưng giờ điểm đạo văn đã đạt ngưỡng, cập nhật lại thành completed
        thesis.status = 'completed';
        console.log(`Luận văn đã được phê duyệt vì tỷ lệ đạo văn (${thesis.plagiarismScore}%) không vượt quá ngưỡng cho phép (${maxPlagiarismPercentage}%)`);
      }
    } catch (error) {
      console.error('Lỗi khi kiểm tra ngưỡng đạo văn:', error);
      // Không thay đổi trạng thái nếu xảy ra lỗi khi kiểm tra
    }
    
    await thesis.save();
    
    res.json({ message: 'Đã cập nhật điểm đạo văn của luận văn', thesis });
  } catch (error) {
    console.error('Lỗi khi cập nhật điểm đạo văn:', error);
    res.status(500).json({
      message: 'Lỗi khi cập nhật điểm đạo văn',
      error: error.message,
    });
  }
};

// @desc    Lấy thống kê về luận văn (cho admin và người dùng)
// @route   GET /api/theses/stats
// @access  Private
const getThesisStatistics = async (req, res) => {
  try {
    // Kiểm tra xem req.user có tồn tại không và có thuộc tính cần thiết không
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để xem thống kê',
        errorType: 'AUTH_REQUIRED'
      });
    }

    // Đảm bảo req.user._id tồn tại
    if (!req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Thông tin người dùng không hợp lệ',
        errorType: 'INVALID_USER'
      });
    }

    const isAdmin = !!req.user.isAdmin; // Convert to boolean explicitly
    let query = isAdmin ? {} : { user: req.user._id };
    
    // Tổng số luận văn
    const totalTheses = await Thesis.countDocuments(query);
    
    // Số lượng theo trạng thái
    const pendingTheses = await Thesis.countDocuments({ ...query, status: 'pending' });
    const processingTheses = await Thesis.countDocuments({ ...query, status: 'processing' });
    const completedTheses = await Thesis.countDocuments({ ...query, status: 'completed' });
    const rejectedTheses = await Thesis.countDocuments({ ...query, status: 'rejected' });
    
    // Điểm đạo văn trung bình (chỉ tính các luận văn đã hoàn thành)
    const completedThesesData = await Thesis.find({ ...query, status: 'completed' })
      .select('plagiarismScore aiPlagiarismScore');
    
    let avgPlagiarismScore = 0;
    let avgAiPlagiarismScore = 0;
    
    if (completedThesesData.length > 0) {
      avgPlagiarismScore = completedThesesData.reduce((sum, thesis) => sum + (thesis.plagiarismScore || 0), 0) / completedThesesData.length;
      avgAiPlagiarismScore = completedThesesData.reduce((sum, thesis) => sum + (thesis.aiPlagiarismScore || 0), 0) / completedThesesData.length;
    }
    
    // Thống kê theo thời gian (6 tháng gần nhất)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyStats = await Thesis.aggregate([
      { 
        $match: { 
          ...query, 
          createdAt: { $gte: sixMonthsAgo } 
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: "$createdAt" }, 
            month: { $month: "$createdAt" } 
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format kết quả
    const timeData = Array(6).fill(0);
    const timeLabels = [];
    
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - 5 + i);
      timeLabels.push(`${date.getMonth() + 1}/${date.getFullYear()}`);
      
      // Tìm dữ liệu tương ứng
      const matchedData = monthlyStats.find(item => 
        item._id.year === date.getFullYear() && 
        item._id.month === date.getMonth() + 1
      );
      
      if (matchedData) {
        timeData[i] = matchedData.count;
      }
    }
    
    return res.json({
      success: true,
      totalTheses,
      pendingTheses,
      processingTheses,
      completedTheses,
      rejectedTheses,
      traditionalPlagiarismScore: avgPlagiarismScore,
      aiPlagiarismScore: avgAiPlagiarismScore,
      averagePlagiarismScore: (avgPlagiarismScore + avgAiPlagiarismScore) / 2,
      timeData,
      timeLabels
    });
  } catch (error) {
    console.error('Lỗi khi lấy thống kê:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thống kê',
      error: error.message
    });
  }
};

// @desc    Kiểm tra lại đạo văn cho luận văn
// @route   POST /api/theses/:id/recheck
// @access  Private (Admin hoặc Tác giả)
const recheckThesis = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.id);
    
    if (!thesis) {
      return res.status(404).json({ message: 'Không tìm thấy luận văn' });
    }
    
    // Kiểm tra nếu người dùng là chủ sở hữu hoặc admin
    if (thesis.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      res.status(403);
      throw new Error('Bạn không có quyền kiểm tra lại đạo văn cho luận văn này');
    }
    
    // Cập nhật trạng thái
    thesis.status = 'processing';
    await thesis.save();
    
    // Thực hiện kiểm tra lại
    const checkAiPlagiarism = req.body.checkAiPlagiarism === undefined ? true : req.body.checkAiPlagiarism;
    const checkTraditionalPlagiarism = req.body.checkTraditionalPlagiarism === undefined ? true : req.body.checkTraditionalPlagiarism;
    
    // Gọi service phát hiện đạo văn
    try {
      const plagiarismResults = await detectPlagiarism(thesis._id, checkAiPlagiarism, checkTraditionalPlagiarism);
      
      // Cập nhật kết quả
      thesis.plagiarismScore = plagiarismResults.plagiarismScore;
      thesis.aiPlagiarismScore = plagiarismResults.aiPlagiarismScore;
      thesis.plagiarismDetails = plagiarismResults.plagiarismDetails || [];
      thesis.aiPlagiarismDetails = plagiarismResults.aiPlagiarismDetails || [];
      thesis.sources = plagiarismResults.sources || [];
      thesis.textMatches = plagiarismResults.textMatches || [];
      thesis.status = 'completed';
      thesis.extractionError = false;
      
      // Kiểm tra ngưỡng đạo văn tối đa từ cấu hình
      try {
        const maxPlagiarismConfig = await Config.findOne({ key: 'maxPlagiarismPercentage' });
        const maxPlagiarismPercentage = maxPlagiarismConfig ? maxPlagiarismConfig.value : 30; // Mặc định 30% nếu không có cấu hình
        
        // Kiểm tra nếu tỷ lệ đạo văn vượt quá ngưỡng
        if (thesis.plagiarismScore > maxPlagiarismPercentage) {
          thesis.status = 'rejected';
          console.log(`Luận văn đã bị từ chối vì tỷ lệ đạo văn (${thesis.plagiarismScore}%) vượt quá ngưỡng cho phép (${maxPlagiarismPercentage}%)`);
        }
      } catch (error) {
        console.error('Lỗi khi kiểm tra ngưỡng đạo văn:', error);
        // Không thay đổi trạng thái nếu xảy ra lỗi khi kiểm tra
      }
      
      await thesis.save();
      
      return res.json({ 
        message: 'Đã thực hiện kiểm tra đạo văn lại cho luận văn', 
        thesis 
      });
    } catch (error) {
      console.error('Lỗi khi kiểm tra đạo văn lại:', error);
      thesis.status = 'completed';
      thesis.extractionError = true;
      await thesis.save();
      
      return res.status(500).json({
        message: 'Lỗi khi kiểm tra đạo văn lại',
        error: error.message,
      });
    }
  } catch (error) {
    console.error('Lỗi khi thực hiện kiểm tra lại đạo văn:', error);
    res.status(500).json({
      message: 'Lỗi khi thực hiện kiểm tra lại đạo văn',
      error: error.message,
    });
  }
};

module.exports = {
  uploadThesis,
  getMyTheses,
  getThesisById,
  getThesisFile,
  downloadThesis,
  downloadPlagiarismReport,
  deleteThesis,
  getAllTheses,
  updateThesisStatus,
  updatePlagiarismScore,
  getThesisStatistics,
  recheckThesis, // Export hàm mới
};
