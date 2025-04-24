/**
 * plagiarism/utils.js
 * Các hàm tiện ích cho dịch vụ phát hiện đạo văn
 */

const natural = require('natural');

// Khởi tạo tokenizer để xử lý văn bản
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

/**
 * Tính độ tương đồng cosine giữa hai đoạn văn
 * @param {string} text1 - Đoạn văn thứ nhất
 * @param {string} text2 - Đoạn văn thứ hai
 * @returns {number} Độ tương đồng (0-1)
 */
const calculateCosineSimilarity = (text1, text2) => {
  // Tokenize các đoạn văn
  const tokens1 = tokenizer.tokenize(text1.toLowerCase());
  const tokens2 = tokenizer.tokenize(text2.toLowerCase());
  
  // Tạo từ điển các từ duy nhất
  const uniqueTokens = new Set([...tokens1, ...tokens2]);
  
  // Tạo vector tần số cho mỗi đoạn văn
  const vector1 = Array(uniqueTokens.size).fill(0);
  const vector2 = Array(uniqueTokens.size).fill(0);
  
  // Chuyển uniqueTokens thành mảng để lấy index
  const uniqueTokensArray = Array.from(uniqueTokens);
  
  // Điền vector tần số
  tokens1.forEach(token => {
    const index = uniqueTokensArray.indexOf(token);
    vector1[index]++;
  });
  
  tokens2.forEach(token => {
    const index = uniqueTokensArray.indexOf(token);
    vector2[index]++;
  });
  
  // Tính độ tương đồng cosine
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (let i = 0; i < uniqueTokensArray.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magnitude1 += vector1[i] * vector1[i];
    magnitude2 += vector2[i] * vector2[i];
  }
  
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  return dotProduct / (magnitude1 * magnitude2);
};

/**
 * Tính độ tương đồng dựa trên n-gram
 * Phương pháp này tốt hơn trong việc phát hiện đạo văn tinh vi khi từ ngữ được thay đổi nhẹ
 * @param {string} text1 - Đoạn văn thứ nhất
 * @param {string} text2 - Đoạn văn thứ hai
 * @param {number} n - Kích thước của n-gram (mặc định là 3)
 * @returns {number} Độ tương đồng (0-1)
 */
const calculateNGramSimilarity = (text1, text2, n = 3) => {
  // Chuyển sang chữ thường để so sánh không phân biệt hoa thường
  const str1 = text1.toLowerCase();
  const str2 = text2.toLowerCase();
  
  // Tạo n-grams từ cả hai văn bản
  const ngrams1 = new Set();
  const ngrams2 = new Set();
  
  // Tạo n-grams cho đoạn văn thứ nhất
  for (let i = 0; i <= str1.length - n; i++) {
    ngrams1.add(str1.substring(i, i + n));
  }
  
  // Tạo n-grams cho đoạn văn thứ hai
  for (let i = 0; i <= str2.length - n; i++) {
    ngrams2.add(str2.substring(i, i + n));
  }
  
  // Tính số lượng n-gram trùng khớp
  let intersection = 0;
  for (const ngram of ngrams1) {
    if (ngrams2.has(ngram)) {
      intersection++;
    }
  }
  
  // Tính hệ số Jaccard
  const union = ngrams1.size + ngrams2.size - intersection;
  return union > 0 ? intersection / union : 0;
};

/**
 * Tính độ tương đồng giữa hai câu dựa trên từng từ
 * @param {string} sentence1 - Câu thứ nhất
 * @param {string} sentence2 - Câu thứ hai
 * @returns {number} Độ tương đồng (0-1)
 */
const calculateSentenceSimilarity = (sentence1, sentence2) => {
  // Tokenize các câu
  const tokens1 = tokenizer.tokenize(sentence1.toLowerCase());
  const tokens2 = tokenizer.tokenize(sentence2.toLowerCase());
  
  // Tính số từ chung giữa hai câu
  let commonWords = 0;
  for (const token of tokens1) {
    if (tokens2.includes(token)) {
      commonWords++;
    }
  }
  
  // Tính hệ số Dice
  const totalWords = tokens1.length + tokens2.length;
  return totalWords > 0 ? (2 * commonWords) / totalWords : 0;
};

/**
 * Phân tích độ dài câu và tính đồng nhất
 * @param {string} content - Nội dung văn bản
 * @returns {Object} Kết quả phân tích
 */
const analyzeSentenceLength = (content) => {
  // Tách văn bản thành các câu
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 5) return { uniformity: 0, average: 0 };
  
  // Tính độ dài từng câu
  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  
  // Tính độ dài trung bình
  const average = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
  
  // Tính độ lệch chuẩn
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - average, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  
  // Tính hệ số biến thiên (CV) - số càng thấp thì càng đồng đều
  const cv = average > 0 ? stdDev / average : 0;
  
  // Đổi thành độ đồng nhất (1 - cv, chuẩn hóa về 0-1)
  const uniformity = Math.max(0, Math.min(1, 1 - cv));
  
  return {
    uniformity,
    average,
    stdDev,
    cv
  };
};

/**
 * Phân tích độ đa dạng từ vựng
 * @param {string} content - Nội dung văn bản
 * @returns {Object} Kết quả phân tích
 */
const analyzeVocabularyDiversity = (content) => {
  // Tách văn bản thành các từ (loại bỏ dấu câu)
  const words = content.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/);
  if (words.length < 50) return { score: 0, uniqueRatio: 0 };
  
  // Đếm số từ riêng biệt
  const uniqueWords = new Set(words);
  
  // Tính tỷ lệ từ độc đáo
  const uniqueRatio = uniqueWords.size / words.length;
  
  // Chỉ số TTR (Type-Token Ratio) được điều chỉnh theo độ dài
  // TTR cao hơn ở AI vì có khả năng sử dụng từ vựng phong phú
  const adjustedTTR = uniqueRatio * Math.log10(words.length);
  
  // Chuẩn hóa về thang điểm 0-1
  const normalizedScore = Math.min(1, adjustedTTR / 0.5);
  
  return {
    score: normalizedScore,
    uniqueRatio,
    uniqueWords: uniqueWords.size,
    totalWords: words.length
  };
};

/**
 * Tính toán số trang dựa trên nội dung thực tế
 * @param {string} content - Nội dung đầy đủ
 * @param {number} charPosition - Vị trí ký tự
 * @returns {number} Số trang chính xác
 */
const calculatePageNumber = (content, charPosition) => {
  // Tìm kiếm các dấu hiệu ngắt trang trong văn bản
  const pageBreakPatterns = [
    /\f/g,                  // Form feed character
    /\n[-–—]\s*\d+\s*[-–—]/g, // Dấu ngắt "-X-" hoặc "—X—"
    /\n[Tt]rang\s+\d+/g,    // "Trang X" hoặc "trang X"
    /\n[Pp]age\s+\d+/g,     // "Page X" hoặc "page X"
  ];
  
  // Tìm tất cả các vị trí ngắt trang
  let pageBreaks = [0]; // Trang đầu tiên bắt đầu từ vị trí 0
  
  for (const pattern of pageBreakPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      pageBreaks.push(match.index);
    }
  }
  
  // Nếu không tìm thấy dấu hiệu ngắt trang, ước tính dựa trên số ký tự
  if (pageBreaks.length <= 1) {
    const CHARS_PER_PAGE = 2000; // Ước tính số ký tự trên một trang
    const estimatedPages = Math.ceil(content.length / CHARS_PER_PAGE);
    
    // Tạo vị trí ngắt trang giả định
    for (let i = 1; i <= estimatedPages; i++) {
      pageBreaks.push(i * CHARS_PER_PAGE);
    }
    
    // Sắp xếp lại
    pageBreaks.sort((a, b) => a - b);
  }
  
  // Xác định trang chứa vị trí ký tự cần tìm
  let pageNumber = 1;
  for (let i = 1; i < pageBreaks.length; i++) {
    if (charPosition < pageBreaks[i]) {
      break;
    }
    pageNumber++;
  }
  
  return pageNumber;
};

// Cache tạm thời cho kết quả tìm kiếm web để giảm số lượt gọi API
const searchCache = new Map();

// Theo dõi trạng thái của các API key
const apiKeyStatus = new Map();

module.exports = {
  tokenizer,
  TfIdf,
  calculateCosineSimilarity,
  calculateNGramSimilarity,
  calculateSentenceSimilarity,
  analyzeSentenceLength,
  analyzeVocabularyDiversity,
  calculatePageNumber,
  searchCache,
  apiKeyStatus
};
