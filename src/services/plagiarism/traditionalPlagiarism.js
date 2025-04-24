/**
 * plagiarism/traditionalPlagiarism.js
 * Module phát hiện đạo văn truyền thống từ cơ sở dữ liệu
 */

const Thesis = require('../../models/Thesis');
const utils = require('./utils');

// Sử dụng tokenizer từ utils
const { 
  tokenizer, 
  TfIdf, 
  calculateCosineSimilarity, 
  calculateSentenceSimilarity, 
  calculatePageNumber,
  calculateNGramSimilarity 
} = utils;

/**
 * Hàm phát hiện đạo văn trong cơ sở dữ liệu luận văn hiện có
 * @param {string} thesisId - ID của luận văn cần kiểm tra
 * @param {string} content - Nội dung luận văn
 * @returns {Object} Kết quả phát hiện đạo văn
 */
const detectPlagiarismInDatabase = async (thesisId, content) => {
  try {
    console.log(`Bắt đầu kiểm tra đạo văn trong cơ sở dữ liệu cho luận văn ${thesisId}`);
    
    // Lấy tất cả các luận văn khác để so sánh
    const existingTheses = await Thesis.find({
      _id: { $ne: thesisId },
      status: 'completed',
    }).select('_id title content author faculty createdAt');

    // Nếu không có luận văn nào khác, trả về kết quả trống
    if (existingTheses.length === 0) {
      return {
        plagiarismScore: 0,
        plagiarismDetails: [],
        textMatches: [],
        sources: []
      };
    }

    // Chuẩn bị nội dung để phân tích đạo văn
    const thesisContent = content;
    const thesisWords = tokenizer.tokenize(thesisContent.toLowerCase());
    
    // Nếu luận văn quá ngắn, không thể phân tích
    if (thesisWords.length < 50) {
      return {
        plagiarismScore: 0,
        plagiarismDetails: [],
        textMatches: [],
        sources: [],
        error: 'Nội dung luận văn quá ngắn để phân tích'
      };
    }

    // Tạo các ngữ đoạn (đoạn văn) từ luận văn hiện tại
    // Giảm kích thước đoạn để phát hiện trùng lặp tốt hơn
    const chunkSize = 150; // Giảm kích thước từ 200 xuống 150
    const overlap = 75; // Tăng overlap để phát hiện được nhiều trùng lặp hơn
    const thesisChunks = [];
    const thesisChunkPositions = []; // Lưu vị trí của từng đoạn trong văn bản gốc
    
    // Chia văn bản thành các đoạn (chunk)
    let chunksCount = 0;
    for (let i = 0; i < thesisWords.length; i += (chunkSize - overlap)) {
      let endPos = i + chunkSize;
      if (endPos <= thesisWords.length) {
        const chunkWords = thesisWords.slice(i, endPos);
        const chunkText = chunkWords.join(' ');
        thesisChunks.push(chunkText);
        
        // Tìm vị trí thực của đoạn trong văn bản gốc
        const chunkPos = thesisContent.toLowerCase().indexOf(chunkText);
        thesisChunkPositions.push(chunkPos >= 0 ? chunkPos : i);
        chunksCount++;
      } else {
        const chunkWords = thesisWords.slice(i);
        const chunkText = chunkWords.join(' ');
        thesisChunks.push(chunkText);
        
        // Tìm vị trí thực của đoạn cuối
        const chunkPos = thesisContent.toLowerCase().indexOf(chunkText);
        thesisChunkPositions.push(chunkPos >= 0 ? chunkPos : i);
        chunksCount++;
      }
    }
    
    // Biến lưu kết quả phát hiện đạo văn
    const plagiarismDetails = [];
    const textMatches = [];
    const sourcesMap = new Map(); // Map để lưu trữ nguồn và độ tương đồng tổng thể
    let totalMatchedWords = 0;
    
    // So sánh từng ngữ đoạn với các luận văn khác
    for (const existingThesis of existingTheses) {
      const existingContent = existingThesis.content;
      const existingWords = tokenizer.tokenize(existingContent.toLowerCase());
      
      // Bỏ qua nếu luận văn quá ngắn để so sánh
      if (existingWords.length < 50) continue;
      
      let thesisMatchedWords = 0; // Số từ trùng khớp với luận văn hiện tại
      
      // Tạo các ngữ đoạn từ luận văn đã tồn tại
      const existingChunks = [];
      const existingChunkPositions = [];
      for (let i = 0; i < existingWords.length; i += (chunkSize - overlap)) {
        let endPos = i + chunkSize;
        if (endPos <= existingWords.length) {
          const chunkWords = existingWords.slice(i, endPos);
          const chunkText = chunkWords.join(' ');
          existingChunks.push(chunkText);
          
          // Tìm vị trí thực của đoạn trong văn bản gốc
          const chunkPos = existingContent.toLowerCase().indexOf(chunkText);
          existingChunkPositions.push(chunkPos >= 0 ? chunkPos : i);
        } else {
          const chunkWords = existingWords.slice(i);
          const chunkText = chunkWords.join(' ');
          existingChunks.push(chunkText);
          
          // Tìm vị trí thực của đoạn cuối
          const chunkPos = existingContent.toLowerCase().indexOf(chunkText);
          existingChunkPositions.push(chunkPos >= 0 ? chunkPos : i);
        }
      }
      
      // Sử dụng TF-IDF để so sánh các ngữ đoạn
      const tfidf = new TfIdf();
      
      // Thêm các ngữ đoạn vào TF-IDF
      thesisChunks.forEach(chunk => tfidf.addDocument(chunk));
      existingChunks.forEach(chunk => tfidf.addDocument(chunk));
      
      // So sánh từng ngữ đoạn của luận văn hiện tại với các ngữ đoạn của luận văn đã tồn tại
      for (let i = 0; i < thesisChunks.length; i++) {
        const thesisChunk = thesisChunks[i];
        const startIndexInThesis = thesisChunkPositions[i];
        
        for (let j = 0; j < existingChunks.length; j++) {
          const existingChunk = existingChunks[j];
          
          // Tính toán nhiều loại độ tương đồng
          const cosineSimilarity = calculateCosineSimilarity(thesisChunk, existingChunk);
          const ngramSimilarity = calculateNGramSimilarity(thesisChunk, existingChunk);
          
          // Sử dụng nhiều ngưỡng phát hiện để nâng cao hiệu quả
          const cosineSimilarityThreshold = 0.65; // Giảm ngưỡng từ 0.8 xuống 0.65
          const ngramSimilarityThreshold = 0.6;
          
          // Lấy độ tương đồng cao nhất từ các phương pháp
          const maxSimilarity = Math.max(cosineSimilarity, ngramSimilarity);
          
          // Phát hiện đạo văn khi vượt ngưỡng của phương pháp bất kỳ
          if (cosineSimilarity >= cosineSimilarityThreshold || ngramSimilarity >= ngramSimilarityThreshold) {
            // Tìm vị trí bắt đầu và kết thúc của đoạn văn trong văn bản gốc
            const startIndex = startIndexInThesis;
            const endIndex = startIndex + thesisChunk.length;
            
            // Tính toán số từ trong đoạn trùng khớp
            const matchedWords = thesisChunk.split(/\s+/).length;
            thesisMatchedWords += matchedWords * maxSimilarity; // Cân nhắc mức độ tương đồng
            totalMatchedWords += matchedWords * maxSimilarity;
            
            // Tính toán số trang chứa đoạn trùng khớp
            const pageNumber = calculatePageNumber(thesisContent, startIndex);
            
            // Thêm vào danh sách chi tiết đạo văn
            plagiarismDetails.push({
              startIndex,
              endIndex,
              matchedText: thesisChunk,
              matchedSource: existingThesis.title,
              sourceId: existingThesis._id,
              matchPercentage: Math.round(maxSimilarity * 100),
              pageNumber
            });
            
            // Thêm vào danh sách matches chi tiết
            textMatches.push({
              sourceText: existingChunk,
              thesisText: thesisChunk,
              similarity: Math.round(maxSimilarity * 100),
              charPositionInThesis: startIndex,
              pageNumber,
              source: {
                title: existingThesis.title,
                author: existingThesis.author || 'Không rõ tác giả',
                url: `/thesis/${existingThesis._id}`,
                faculty: existingThesis.faculty || 'Không rõ khoa',
                year: existingThesis.createdAt ? new Date(existingThesis.createdAt).getFullYear() : 'Không rõ năm'
              }
            });
          }
        }
      }
      
      // Tính toán độ tương đồng tổng thể với luận văn hiện tại
      if (thesisMatchedWords > 0) {
        const overallSimilarity = Math.min(thesisMatchedWords / thesisWords.length, 1.0);
        
        // Lưu thông tin nguồn vào map
        sourcesMap.set(existingThesis._id.toString(), {
          title: existingThesis.title,
          author: existingThesis.author || 'Không rõ tác giả',
          similarity: Math.round(overallSimilarity * 100),
          url: `/thesis/${existingThesis._id}`
        });
      }
    }
    
    // Sắp xếp các trùng khớp theo độ tương đồng giảm dần
    textMatches.sort((a, b) => b.similarity - a.similarity);
    
    // Chuyển map nguồn thành mảng và sắp xếp theo độ tương đồng
    const sources = Array.from(sourcesMap.values()).sort((a, b) => b.similarity - a.similarity);
    
    // Tổng số từ trong toàn bộ bài
    const totalWords = thesisWords.length;
    
    // Tính điểm đạo văn dựa trên tổng số từ trùng khớp so với tổng số từ
    const plagiarismScore = totalWords > 0 ? 
      Math.min(Math.round((totalMatchedWords / totalWords) * 100), 100) : 0;
    
    return {
      plagiarismScore,
      plagiarismDetails,
      textMatches,
      sources,
    };
  } catch (error) {
    console.error('Lỗi khi phát hiện đạo văn trong cơ sở dữ liệu:', error);
    throw error;
  }
};

module.exports = {
  detectPlagiarismInDatabase
};
