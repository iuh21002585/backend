const mongoose = require('mongoose');

const thesisSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề luận văn không được để trống'],
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    faculty: {
      type: String,
      default: 'Chưa phân loại',
    },
    filePath: {
      type: String,
      required: [true, 'Đường dẫn tệp không được để trống'],
    },
    fileName: {
      type: String,
      required: [true, 'Tên tệp không được để trống'],
    },
    fileSize: {
      type: Number,
      required: [true, 'Kích thước tệp không được để trống'],
    },
    fileType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'rejected'],
      default: 'pending',
    },
    abstract: {
      type: String,
      default: '',
    },
    plagiarismScore: {
      type: Number,
      default: 0,
    },
    aiPlagiarismScore: {
      type: Number,
      default: 0,
    },
    reportUrl: {
      type: String,
      default: '',
    },
    // Đường dẫn đến báo cáo đạo văn truyền thống có highlight
    plagiarismReportPath: {
      type: String,
      default: '',
    },
    // Đường dẫn đến báo cáo đạo văn AI có highlight
    aiPlagiarismReportPath: {
      type: String,
      default: '',
    },
    sources: [
      {
        title: String,
        author: String,
        similarity: Number,
        url: String,
      },
    ],
    textMatches: [
      {
        sourceText: String,
        thesisText: String,
        similarity: Number,
        source: {
          title: String,
          author: String,
          url: String,
        },
      },
    ],
    plagiarismDetails: [
      {
        startIndex: Number,
        endIndex: Number,
        matchedText: String,
        matchedSource: String,
        matchPercentage: Number,
      },
    ],
    aiPlagiarismDetails: [
      {
        startIndex: Number,
        endIndex: Number,
        matchedText: String,
        aiConfidence: Number,
      },
    ],
    content: {
      type: String,
      required: [true, 'Nội dung luận văn không được để trống'],
    },
    extractionError: {
      type: Boolean,
      default: false,
    },
    processingTime: {
      type: Number,
      default: 0,
      description: 'Thời gian xử lý báo cáo tính bằng giây'
    },
  },
  {
    timestamps: true,
  }
);

const Thesis = mongoose.model('Thesis', thesisSchema);

module.exports = Thesis;
