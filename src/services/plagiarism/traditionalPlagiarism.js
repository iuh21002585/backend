/**
 * plagiarism/traditionalPlagiarism.js
 * Module phát hiện đạo văn truyền thống từ cơ sở dữ liệu
 */

const Thesis = require('../../models/Thesis');
const utils = require('./utils');

// Import module xử lý tài liệu tham khảo
let referenceProcessor;
try {
  referenceProcessor = require('./referenceProcessor');
} catch (error) {
  console.error('Không thể tải module xử lý tài liệu tham khảo:', error.message);
}

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

    console.log(`Tìm thấy ${existingTheses.length} luận văn đã hoàn thành trong cơ sở dữ liệu để so sánh`);

    // Tải dữ liệu tham khảo từ file data.txt
    let referenceData = {
      content: '',
      paragraphs: []
    };

    if (referenceProcessor) {
      try {
        console.log('Bắt đầu tải dữ liệu tham khảo từ file data.txt...');
        referenceData = await referenceProcessor.processReferenceData();
        console.log(`Đã tải dữ liệu tham khảo với ${referenceData.paragraphs.length} đoạn văn`);
      } catch (refError) {
        console.error('Lỗi khi tải dữ liệu tham khảo:', refError);
      }
    } else {
      console.log('Module xử lý tài liệu tham khảo không khả dụng');
    }

    // Nếu không có luận văn nào khác và không có dữ liệu tham khảo, trả về kết quả trống
    if (existingTheses.length === 0 && referenceData.paragraphs.length === 0) {
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
    
    // So sánh với dữ liệu tham khảo từ file data.txt
    if (referenceData.paragraphs && referenceData.paragraphs.length > 0) {
      console.log(`So sánh với ${referenceData.paragraphs.length} đoạn văn từ dữ liệu tham khảo`);
      
      // Biến lưu trữ tổng số từ trùng khớp với dữ liệu tham khảo
      let referenceMatchedWords = 0;
      
      // Xử lý từng đoạn văn trong dữ liệu tham khảo
      for (let i = 0; i < referenceData.paragraphs.length; i++) {
        const refParagraph = referenceData.paragraphs[i];
        
        // Bỏ qua các đoạn quá ngắn
        if (refParagraph.length < 30) continue;
        
        // Tokenize đoạn văn
        const refWords = tokenizer.tokenize(refParagraph.toLowerCase());
        
        // Tạo các ngữ đoạn từ đoạn văn tham khảo
        const refChunks = [];
        for (let j = 0; j < refWords.length; j += (chunkSize - overlap)) {
          let endPos = j + chunkSize;
          if (endPos <= refWords.length) {
            const chunkWords = refWords.slice(j, endPos);
            refChunks.push(chunkWords.join(' '));
          } else {
            const chunkWords = refWords.slice(j);
            refChunks.push(chunkWords.join(' '));
          }
        }
        
        // Sử dụng TF-IDF để so sánh các ngữ đoạn
        const tfidf = new TfIdf();
        
        // Thêm các ngữ đoạn vào TF-IDF
        thesisChunks.forEach(chunk => tfidf.addDocument(chunk));
        refChunks.forEach(chunk => tfidf.addDocument(chunk));
        
        // So sánh từng ngữ đoạn của luận văn hiện tại với các ngữ đoạn của đoạn văn tham khảo
        for (let j = 0; j < thesisChunks.length; j++) {
          const thesisChunk = thesisChunks[j];
          const startIndexInThesis = thesisChunkPositions[j];
          
          for (let k = 0; k < refChunks.length; k++) {
            const refChunk = refChunks[k];
            
            // Tính toán độ tương đồng
            const cosineSimilarity = calculateCosineSimilarity(thesisChunk, refChunk);
            const ngramSimilarity = calculateNGramSimilarity(thesisChunk, refChunk);
            
            // Ngưỡng phát hiện: giảm xuống để tăng độ nhạy với dữ liệu tham khảo
            const cosineSimilarityThreshold = 0.55; 
            const ngramSimilarityThreshold = 0.5;
            
            // Lấy độ tương đồng cao nhất
            const maxSimilarity = Math.max(cosineSimilarity, ngramSimilarity);
            
            // Phát hiện đạo văn khi vượt ngưỡng
            if (cosineSimilarity >= cosineSimilarityThreshold || ngramSimilarity >= ngramSimilarityThreshold) {
              // Tính toán thông tin chi tiết
              const startIndex = startIndexInThesis;
              const endIndex = startIndex + thesisChunk.length;
              const matchedWords = thesisChunk.split(/\s+/).length;
              
              // Cập nhật số từ trùng khớp
              referenceMatchedWords += matchedWords * maxSimilarity;
              totalMatchedWords += matchedWords * maxSimilarity;
              
              // Tính toán số trang
              const pageNumber = calculatePageNumber(thesisContent, startIndex);
              
              // Thêm vào danh sách chi tiết đạo văn
              plagiarismDetails.push({
                startIndex,
                endIndex,
                matchedText: thesisChunk,
                matchedSource: 'Tài liệu tham khảo',
                sourceType: 'reference',
                matchPercentage: Math.round(maxSimilarity * 100),
                pageNumber
              });
              
              // Thêm vào danh sách matches chi tiết
              textMatches.push({
                sourceText: refChunk,
                thesisText: thesisChunk,
                similarity: Math.round(maxSimilarity * 100),
                charPositionInThesis: startIndex,
                pageNumber,
                source: {
                  title: `Đoạn văn số ${i+1} từ dữ liệu tham khảo`,
                  author: 'Tài liệu tham khảo',
                  url: null,
                  type: 'reference'
                }
              });
            }
          }
        }
      }
      
      // Tính toán độ tương đồng tổng thể với dữ liệu tham khảo
      if (referenceMatchedWords > 0) {
        const overallRefSimilarity = Math.min(referenceMatchedWords / thesisWords.length, 1.0);
        
        // Lưu thông tin nguồn vào map
        sourcesMap.set('reference_data_source', {
          title: 'Dữ liệu tham khảo',
          author: 'Tài liệu tham khảo',
          similarity: Math.round(overallRefSimilarity * 100),
          type: 'reference'
        });
      }
      
      console.log(`Hoàn thành kiểm tra với dữ liệu tham khảo, ${textMatches.length} đoạn trùng khớp`);
    }
    
    // Cập nhật danh sách nguồn
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
