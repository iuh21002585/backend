/**
 * aiPlagiarism.js
 * Module phát hiện nội dung được tạo bởi AI trong luận văn
 */

const OpenAI = require('openai');
const fetch = require('node-fetch');
const utils = require('./utils');

// Sử dụng các hàm và biến từ utils.js
const { tokenizer, analyzeSentenceLength, analyzeVocabularyDiversity } = utils;

// Khởi tạo OpenAI
let openai = null;

try {
  if (process.env.OPENAI_API_KEY) {
    console.log('Đang khởi tạo cấu hình OpenAI API...');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORGANIZATION_ID || undefined,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
    console.log('Khởi tạo OpenAI API thành công!');
  } else {
    console.warn('OPENAI_API_KEY không được cấu hình - sẽ dùng phương pháp thay thế (pattern matching và phân tích thống kê)');
  }
} catch (error) {
  console.error('Lỗi khởi tạo OpenAI API:', error.message);
  console.error('Chi tiết lỗi:', error.stack);
  console.warn('Hệ thống sẽ chuyển sang sử dụng phương pháp thay thế');
}

/**
 * Hàm phát hiện nội dung được tạo bởi AI
 * @param {string} content - Nội dung luận văn
 * @param {Object} options - Tùy chọn cấu hình
 * @returns {Object} Kết quả phát hiện nội dung AI
 */
const detectAIPlagiarism = async (content, options = {}) => {
  try {
    console.log('Bắt đầu phát hiện nội dung AI');
    
    // Mảng lưu trữ kết quả từ tất cả các phương pháp phát hiện khả dụng
    const detectionResults = [];
    let hasError = false;
    
    // Kiểm tra xem OpenAI API có sẵn không
    if (openai && process.env.OPENAI_API_KEY) {
      try {
        console.log('Đang sử dụng OpenAI API để phát hiện nội dung AI');
        const openaiResult = await detectWithOpenAI(content);
        detectionResults.push({
          provider: 'openai',
          score: openaiResult.aiPlagiarismScore,
          details: openaiResult.aiPlagiarismDetails,
          weight: 0.4 // Đặt trọng số cao hơn cho OpenAI
        });
      } catch (error) {
        console.error('Lỗi khi sử dụng OpenAI:', error.message);
        hasError = true;
      }
    }
    
    // Thử GPTZero nếu có API key
    if (process.env.GPTZERO_API_KEY) {
      try {
        console.log('Đang sử dụng GPTZero để phát hiện nội dung AI');
        const gptzeroResult = await detectWithGPTZero(content);
        detectionResults.push({
          provider: 'gptzero',
          score: gptzeroResult.aiPlagiarismScore,
          details: gptzeroResult.aiPlagiarismDetails,
          weight: 0.3
        });
      } catch (error) {
        console.error('Lỗi khi sử dụng GPTZero:', error.message);
        hasError = true;
      }
    }
    
    // Thử Gemini nếu có API key
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log('Đang sử dụng Gemini để phát hiện nội dung AI');
        const geminiResult = await detectWithGemini(content);
        detectionResults.push({
          provider: 'gemini',
          score: geminiResult.aiPlagiarismScore,
          details: geminiResult.aiPlagiarismDetails,
          weight: 0.3
        });
      } catch (error) {
        console.error('Lỗi khi sử dụng Gemini:', error.message);
        hasError = true;
      }
    }
    
    // Luôn sử dụng phương pháp thay thế để có kết quả dự phòng và so sánh
    console.log('Sử dụng phương pháp thay thế để phát hiện nội dung AI');
    const alternativeResult = detectAIPlagiarismAlternative(content);
    detectionResults.push({
      provider: 'alternative',
      score: alternativeResult.score,
      details: alternativeResult.details,
      aiPlagiarismDetails: alternativeResult.aiPlagiarismDetails,
      weight: 0.25 // Trọng số thấp hơn cho phương pháp thay thế
    });
    
    // Nếu không có kết quả từ bất kỳ phương pháp nào, chỉ sử dụng phương pháp thay thế
    if (detectionResults.length === 1 && detectionResults[0].provider === 'alternative') {
      return {
        aiPlagiarismScore: alternativeResult.score,
        aiPlagiarismDetails: alternativeResult.aiPlagiarismDetails || generateAIPlagiarismDetails(content, alternativeResult.score),
        analysisDetails: alternativeResult.details,
        usedProvider: 'alternative',
        hasError: hasError
      };
    }
    
    // Tính toán điểm số tổng hợp dựa trên trọng số
    const totalWeight = detectionResults.reduce((sum, result) => sum + result.weight, 0);
    const aiPlagiarismScore = Math.round(
      detectionResults.reduce((sum, result) => sum + (result.score * result.weight), 0) / totalWeight
    );
    
    // Kết hợp chi tiết phát hiện từ tất cả các phương pháp
    const combinedDetails = combineAIPlagiarismDetails(detectionResults, content);
    
    return {
      aiPlagiarismScore,
      aiPlagiarismDetails: combinedDetails,
      analysisDetails: detectionResults.map(result => ({
        provider: result.provider,
        score: result.score,
        weight: result.weight
      })),
      usedProviders: detectionResults.map(result => result.provider),
      hasError: hasError
    };
  } catch (error) {
    console.error('Lỗi khi phát hiện nội dung AI:', error);
    // Nếu có lỗi, vẫn trả về kết quả từ phương pháp thay thế
    const aiPlagiarismResult = detectAIPlagiarismAlternative(content);
    return {
      aiPlagiarismScore: aiPlagiarismResult.score,
      aiPlagiarismDetails: aiPlagiarismResult.aiPlagiarismDetails || generateAIPlagiarismDetails(content, aiPlagiarismResult.score),
      analysisDetails: aiPlagiarismResult.details,
      error: error.message,
      usedProvider: 'alternative',
      hasError: true
    };
  }
};

/**
 * Kết hợp chi tiết phát hiện từ nhiều phương pháp
 * @param {Array} detectionResults - Kết quả từ các phương pháp phát hiện
 * @param {string} content - Nội dung gốc
 * @returns {Array} Chi tiết phát hiện đã kết hợp
 */
const combineAIPlagiarismDetails = (detectionResults, content) => {
  // Tạo bản đồ đánh dấu cho từng ký tự trong nội dung
  const contentLength = content.length;
  const confidenceMap = new Array(contentLength).fill(0);
  
  // Đối với mỗi phương pháp phát hiện, cập nhật bản đồ đánh dấu
  detectionResults.forEach(result => {
    if (!result.details || !Array.isArray(result.details)) return;
    
    result.details.forEach(detail => {
      if (detail.startIndex !== undefined && detail.endIndex !== undefined) {
        // Đảm bảo các chỉ số nằm trong giới hạn nội dung
        const startIdx = Math.max(0, Math.min(detail.startIndex, contentLength - 1));
        const endIdx = Math.max(0, Math.min(detail.endIndex, contentLength - 1));
        
        // Cập nhật điểm đánh dấu cho phạm vi này
        for (let i = startIdx; i <= endIdx; i++) {
          confidenceMap[i] += (detail.aiConfidence || 50) * result.weight;
        }
      }
    });
  });
  
  // Tìm các đoạn có điểm đánh dấu cao
  const threshold = 10; // Ngưỡng để xác định đoạn có điểm đánh dấu cao
  const segments = [];
  let currentSegment = null;
  
  for (let i = 0; i < contentLength; i++) {
    if (confidenceMap[i] > threshold) {
      if (!currentSegment) {
        currentSegment = {
          startIndex: i,
          endIndex: i,
          confidenceSum: confidenceMap[i],
          count: 1
        };
      } else {
        currentSegment.endIndex = i;
        currentSegment.confidenceSum += confidenceMap[i];
        currentSegment.count += 1;
      }
    } else if (currentSegment) {
      segments.push({
        startIndex: currentSegment.startIndex,
        endIndex: currentSegment.endIndex,
        matchedText: content.substring(currentSegment.startIndex, currentSegment.endIndex + 1),
        aiConfidence: Math.round(currentSegment.confidenceSum / currentSegment.count)
      });
      currentSegment = null;
    }
  }
  
  // Đừng quên đoạn cuối cùng nếu còn
  if (currentSegment) {
    segments.push({
      startIndex: currentSegment.startIndex,
      endIndex: currentSegment.endIndex,
      matchedText: content.substring(currentSegment.startIndex, currentSegment.endIndex + 1),
      aiConfidence: Math.round(currentSegment.confidenceSum / currentSegment.count)
    });
  }
  
  // Lọc và hợp nhất các đoạn gần nhau
  return mergeAdjacentSegments(segments);
};

/**
 * Hợp nhất các đoạn gần nhau
 * @param {Array} segments - Các đoạn cần hợp nhất
 * @returns {Array} Các đoạn đã hợp nhất
 */
const mergeAdjacentSegments = (segments) => {
  if (segments.length <= 1) return segments;
  
  segments.sort((a, b) => a.startIndex - b.startIndex);
  
  const mergedSegments = [];
  let currentSegment = segments[0];
  
  for (let i = 1; i < segments.length; i++) {
    const nextSegment = segments[i];
    
    // Nếu khoảng cách giữa hai đoạn đủ gần, hợp nhất chúng
    if (nextSegment.startIndex - currentSegment.endIndex <= 50) {
      currentSegment = {
        startIndex: currentSegment.startIndex,
        endIndex: nextSegment.endIndex,
        matchedText: currentSegment.matchedText + ' ... ' + nextSegment.matchedText,
        aiConfidence: Math.round((currentSegment.aiConfidence + nextSegment.aiConfidence) / 2)
      };
    } else {
      mergedSegments.push(currentSegment);
      currentSegment = nextSegment;
    }
  }
  
  mergedSegments.push(currentSegment);
  return mergedSegments;
};

/**
 * Sử dụng OpenAI để phát hiện nội dung AI
 * @param {string} content - Nội dung cần phân tích
 * @returns {Object} Kết quả phát hiện
 */
const detectWithOpenAI = async (content) => {
  try {
    // Chuẩn bị nội dung để phân tích
    const contentWords = tokenizer.tokenize(content.toLowerCase());
    
    // Nếu nội dung quá ngắn, không thể phân tích
    if (contentWords.length < 100) {
      return {
        aiPlagiarismScore: 0,
        aiPlagiarismDetails: [],
        error: 'Nội dung luận văn quá ngắn để phân tích',
        usedProvider: 'openai'
      };
    }
    
    // Chia nội dung thành các đoạn để phân tích
    const chunkSize = 200;
    const numChunks = Math.min(5, Math.ceil(contentWords.length / chunkSize));
    const chunks = [];
    
    // Chọn các đoạn phân bố đều trong văn bản
    for (let i = 0; i < numChunks; i++) {
      const startIndex = Math.floor((contentWords.length / numChunks) * i);
      const endIndex = Math.min(startIndex + chunkSize, contentWords.length);
      chunks.push(contentWords.slice(startIndex, endIndex).join(' '));
    }
    
    // Phân tích từng đoạn bằng OpenAI
    const aiDetectionResults = [];
    
    for (const chunk of chunks) {
      const response = await openai.completions.create({
        model: "gpt-3.5-turbo-instruct",
        prompt: `Đánh giá đoạn văn sau và cho biết khả năng nó được viết bởi AI (như ChatGPT) với thang điểm từ 0-100%. Chỉ trả về một số nguyên từ 0-100.\n\nĐoạn văn: "${chunk}"`,
        max_tokens: 10,
        temperature: 0.2,
      });
      
      const result = response.choices[0].text.trim();
      const score = parseInt(result.match(/\d+/)[0], 10);
      
      aiDetectionResults.push({
        chunk,
        score: isNaN(score) ? 0 : score,
      });
    }
    
    // Tính điểm trung bình
    const aiPlagiarismScore = Math.round(
      aiDetectionResults.reduce((sum, result) => sum + result.score, 0) / aiDetectionResults.length
    );
    
    // Tạo chi tiết về các đoạn được phát hiện có khả năng cao là do AI tạo ra
    const aiPlagiarismDetails = aiDetectionResults
      .filter(result => result.score > 70)
      .map(result => {
        const startIndex = content.toLowerCase().indexOf(result.chunk);
        return {
          startIndex,
          endIndex: startIndex + result.chunk.length,
          matchedText: result.chunk,
          aiConfidence: result.score,
        };
      });
    
    return {
      aiPlagiarismScore,
      aiPlagiarismDetails,
      usedProvider: 'openai'
    };
  } catch (error) {
    console.error('Lỗi khi sử dụng OpenAI:', error);
    throw error;
  }
};

/**
 * Sử dụng GPTZero để phát hiện nội dung AI
 * @param {string} content - Nội dung cần phân tích
 * @returns {Object} Kết quả phát hiện
 */
const detectWithGPTZero = async (content) => {
  try {
    const response = await fetch('https://api.gptzero.me/v2/predict/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GPTZERO_API_KEY}`
      },
      body: JSON.stringify({
        document: content
      })
    });
    
    if (!response.ok) {
      throw new Error('GPTZero API error');
    }
    
    const data = await response.json();
    const aiPlagiarismScore = Math.round(data.perplexity * 100);
    
    return {
      aiPlagiarismScore,
      aiPlagiarismDetails: data.predictions,
      usedProvider: 'gptzero'
    };
  } catch (error) {
    console.error('Lỗi khi sử dụng GPTZero:', error);
    throw error;
  }
};

/**
 * Sử dụng Gemini để phát hiện nội dung AI
 * @param {string} content - Nội dung cần phân tích
 * @returns {Object} Kết quả phát hiện
 */
const detectWithGemini = async (content) => {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Phân tích đoạn văn sau và cho biết khả năng nó được tạo bởi AI. Trả về điểm số từ 0-100: ${content}`
          }]
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error('Gemini API error');
    }
    
    const data = await response.json();
    const aiPlagiarismScore = parseInt(data.candidates[0].content.parts[0].text.match(/\d+/)[0], 10);
    
    return {
      aiPlagiarismScore,
      aiPlagiarismDetails: data.candidates[0].content.parts[0].text,
      usedProvider: 'gemini'
    };
  } catch (error) {
    console.error('Lỗi khi sử dụng Gemini:', error);
    throw error;
  }
};

/**
 * Phương pháp thay thế để phát hiện nội dung AI khi không có OpenAI API
 * @param {string} content - Nội dung cần phân tích
 * @returns {Object} Kết quả phát hiện nội dung AI
 */
const detectAIPlagiarismAlternative = (content) => {
  console.log('Sử dụng phương pháp thay thế để phát hiện nội dung AI');
  
  // Phân tích cấu trúc văn bản
  const paragraphs = content.split(/\n\s*\n/);
  const sentences = content.match(/[^.!?]+[.!?]/g) || [];
  
  // Lưu vị trí của từng câu trong nội dung gốc để có thể xác định vị trí chính xác sau này
  const sentencePositions = [];
  let currentPosition = 0;
  for (const sentence of sentences) {
    const startIndex = content.indexOf(sentence, currentPosition);
    if (startIndex !== -1) {
      sentencePositions.push({
        sentence,
        startIndex,
        endIndex: startIndex + sentence.length
      });
      currentPosition = startIndex + sentence.length;
    }
  }
  
  // Các đặc điểm của văn bản do AI tạo ra
  const aiCharacteristics = [
    // Các mẫu cấu trúc câu
    { pattern: /đảm bảo rằng/gi, weight: 0.5, context: 'sentence' },
    { pattern: /như đã đề cập/gi, weight: 0.4, context: 'sentence' },
    { pattern: /cần lưu ý rằng/gi, weight: 0.5, context: 'sentence' },
    { pattern: /trước hết.*sau đó.*cuối cùng/is, weight: 0.6, context: 'paragraph' },
    { pattern: /mặt khác/gi, weight: 0.3, context: 'sentence' },
    { pattern: /một cách toàn diện/gi, weight: 0.7, context: 'sentence' },
    { pattern: /ngoài ra/gi, weight: 0.3, context: 'sentence' },
    { pattern: /trong bối cảnh này/gi, weight: 0.6, context: 'sentence' },
    { pattern: /với mục đích/gi, weight: 0.4, context: 'sentence' },
    { pattern: /tóm lại/gi, weight: 0.5, context: 'paragraph' },
    
    // Mẫu câu phức hợp
    { pattern: /không chỉ.*mà còn/is, weight: 0.6, context: 'sentence' },
    { pattern: /tuy nhiên, cần phải/gi, weight: 0.5, context: 'sentence' },
    { pattern: /điều này cho thấy rằng/gi, weight: 0.7, context: 'sentence' },
    { pattern: /dựa trên kết quả/gi, weight: 0.6, context: 'sentence' },
    { pattern: /theo quan điểm của tôi/gi, weight: 0.3, context: 'sentence' },
    { pattern: /có thể kết luận rằng/gi, weight: 0.7, context: 'sentence' },

    // Các mẫu ngữ pháp
    { name: 'passive_voice', pattern: /(được [a-zà-ỹ]+|đã được [a-zà-ỹ]+)/gi, context: 'sentence', weight: 2 },
    { name: 'complex_phrases', pattern: /(một cách toàn diện|từ góc độ [a-zà-ỹ]+|trong bối cảnh [a-zà-ỹ]+|với tư cách là)/gi, context: 'sentence', weight: 3 },

    // Các mẫu từ vựng
    { name: 'advanced_vocabulary', pattern: /(phương pháp luận|tương quan|tương tác|triển khai|tổng hợp|đa dạng hóa|tối ưu hóa|chuẩn hóa)/gi, context: 'sentence', weight: 4 },
    { name: 'technical_terms', pattern: /(thuật toán|mô hình|hệ thống|cơ sở dữ liệu|kết cấu|phân tích|tổng hợp|đánh giá)/gi, context: 'sentence', weight: 3 },

    // Các mẫu đặc trưng
    { name: 'repetitive_structure', pattern: /(thứ nhất.*?thứ hai.*?thứ ba|một mặt.*?mặt khác)/gi, context: 'paragraph', weight: 4 },
    { name: 'list_pattern', pattern: /([0-9]+\. .*?){3,}/g, context: 'paragraph', weight: 3 },
  ];

  // Sử dụng các hàm phân tích từ utils
  const sentenceLengthAnalysis = analyzeSentenceLength(content);
  const vocabularyAnalysis = analyzeVocabularyDiversity(content);

  // Kiểm tra mỗi đặc điểm và tính điểm
  let score = 0;
  let maxScore = 0;
  let detectedPatterns = {};

  for (const characteristic of aiCharacteristics) {
    maxScore += characteristic.weight;
    let matches = [];

    if (characteristic.context === 'sentence') {
      // Kiểm tra trong từng câu
      for (const sentence of sentences) {
        const match = sentence.match(characteristic.pattern);
        if (match) matches.push(match[0]);
      }
    } else if (characteristic.context === 'paragraph') {
      // Kiểm tra trong từng đoạn văn
      for (const paragraph of paragraphs) {
        const match = paragraph.match(characteristic.pattern);
        if (match) matches.push(match[0]);
      }
    } else {
      // Kiểm tra trong toàn bộ văn bản
      const match = content.match(characteristic.pattern);
      if (match) matches = match;
    }

    // Nếu tìm thấy mẫu, cộng điểm
    if (matches && matches.length > 0) {
      score += characteristic.weight;
      detectedPatterns[characteristic.name || characteristic.pattern] = {
        count: matches.length,
        examples: matches.slice(0, 3) // Lưu tối đa 3 ví dụ
      };
    }
  }

  // Thêm điểm từ phân tích độ dài câu và từ vựng
  const sentenceUniformityWeight = 15;
  const vocabularyWeight = 20;
  
  maxScore += sentenceUniformityWeight + vocabularyWeight;
  
  // Độ đồng đều trong độ dài câu cao -> điểm cao (AI thường viết câu có độ dài tương đối đồng đều)
  score += sentenceLengthAnalysis.uniformity * sentenceUniformityWeight;
  
  // Đa dạng từ vựng cao -> điểm cao (AI thường có vốn từ vựng phong phú)
  score += vocabularyAnalysis.score * vocabularyWeight;
  
  // Lưu các đặc điểm phân tích thống kê
  detectedPatterns['sentence_uniformity'] = {
    value: sentenceLengthAnalysis.uniformity.toFixed(2),
    details: `Độ dài trung bình: ${sentenceLengthAnalysis.average.toFixed(1)} từ/câu`
  };
  
  detectedPatterns['vocabulary_diversity'] = {
    value: vocabularyAnalysis.score.toFixed(2),
    details: `${vocabularyAnalysis.uniqueWords} từ độc đáo / ${vocabularyAnalysis.totalWords} tổng số từ`
  };

  // Tính điểm đạo văn AI
  const aiScore = Math.round((score / maxScore) * 100);

  // Tạo chi tiết đạo văn AI
  const aiPlagiarismDetails = [];

  if (aiScore >= 30) {
    // Đánh giá từng câu để xác định câu nào có khả năng cao là do AI tạo ra
    for (let i = 0; i < sentencePositions.length; i++) {
      const sentenceInfo = sentencePositions[i];
      const sentence = sentenceInfo.sentence;

      // Đánh giá câu này dựa trên các đặc điểm của văn bản AI
      let sentenceScore = 0;
      let sentenceMaxScore = 0;

      for (const characteristic of aiCharacteristics) {
        sentenceMaxScore += characteristic.weight;
        const match = sentence.match(characteristic.pattern);
        if (match) {
          sentenceScore += characteristic.weight;
        }
      }

      // Nếu câu có điểm cao (>= 50%), đánh dấu là do AI tạo ra
      if (sentenceScore / sentenceMaxScore >= 0.5) {
        aiPlagiarismDetails.push({
          startIndex: sentenceInfo.startIndex,
          endIndex: sentenceInfo.endIndex,
          matchedText: sentence,
          aiConfidence: Math.round((sentenceScore / sentenceMaxScore) * 100)
        });
      }
    }
  }

  // Trả về điểm và chi tiết phân tích
  return {
    score: aiScore,
    details: detectedPatterns,
    aiPlagiarismDetails: aiPlagiarismDetails
  };
};

/**
 * Tạo chi tiết đạo văn AI dựa trên điểm đạo văn
 * @param {string} content - Nội dung luận văn
 * @param {number} aiPlagiarismScore - Điểm đạo văn AI
 * @returns {Array} Chi tiết đạo văn AI
 */
const generateAIPlagiarismDetails = (content, aiPlagiarismScore) => {
  if (aiPlagiarismScore < 30) {
    return []; // Nếu điểm thấp, không cần tạo chi tiết
  }
  
  // Chia văn bản thành các đoạn
  const paragraphs = content.split(/\n\s*\n/);
  
  // Chọn một số đoạn để phân tích chi tiết (tối đa 3 đoạn)
  const numParagraphsToAnalyze = Math.min(3, paragraphs.length);
  const paragraphIndices = [];
  
  // Chọn các đoạn phân bố đều trong văn bản
  for (let i = 0; i < numParagraphsToAnalyze; i++) {
    const index = Math.floor((paragraphs.length / numParagraphsToAnalyze) * i);
    paragraphIndices.push(index);
  }
  
  // Tạo chi tiết cho từng đoạn
  const details = [];
  let startIndexInContent = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    
    if (paragraphIndices.includes(i) && paragraph.length > 50) { // Chỉ xem xét đoạn đủ dài
      // Tính toán điểm AI cho đoạn này (dao động xung quanh điểm tổng)
      const paragraphScore = Math.min(100, Math.max(0, aiPlagiarismScore + Math.floor(Math.random() * 20) - 10));
      
      details.push({
        startIndex: startIndexInContent,
        endIndex: startIndexInContent + paragraph.length,
        matchedText: paragraph,
        aiConfidence: paragraphScore,
      });
    }
    
    startIndexInContent += paragraph.length + 2; // +2 cho "\n\n" giữa các đoạn
  }
  
  // Nếu không tìm thấy đoạn nào phù hợp, hãy sử dụng phương pháp dựa trên từ
  if (details.length === 0 && aiPlagiarismScore > 50) {
    const contentWords = tokenizer.tokenize(content.toLowerCase());
    
    // Tạo một đoạn ngẫu nhiên
    const chunkSize = 100 + Math.floor(Math.random() * 100); // 100-200 từ
    if (contentWords.length > chunkSize) {
      const startWordIndex = Math.floor(Math.random() * (contentWords.length - chunkSize));
      const chunk = contentWords.slice(startWordIndex, startWordIndex + chunkSize).join(' ');
      
      const startIndex = content.toLowerCase().indexOf(chunk);
      if (startIndex !== -1) {
        details.push({
          startIndex,
          endIndex: startIndex + chunk.length,
          matchedText: chunk,
          aiConfidence: aiPlagiarismScore,
        });
      }
    }
  }
  
  return details;
};

module.exports = {
  detectAIPlagiarism,
  detectWithOpenAI,
  detectWithGPTZero,
  detectWithGemini,
  detectAIPlagiarismAlternative
};