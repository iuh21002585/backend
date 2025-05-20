/**
 * Script kiểm tra đạo văn trực tiếp từ file data.txt
 * Script này cho phép người dùng trực tiếp kiểm tra một đoạn văn bản có trùng khớp với
 * nội dung trong file data.txt hay không, mà không cần thông qua cơ sở dữ liệu.
 * 
 * Phiên bản tối ưu: Hỗ trợ xử lý file dữ liệu lớn, kiểm tra từ file và xuất kết quả ra file.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const { performance } = require('perf_hooks');

// Cấu hình đường dẫn và tham số
const DATA_FILE_PATH = path.join(__dirname, 'reference_database', 'data.txt');
const OUTPUT_DIR = path.join(__dirname, 'plagiarism_results');

// Các tham số mặc định
const DEFAULT_CONFIG = {
  threshold: 60,            // Ngưỡng phát hiện đạo văn (%)
  minSentenceLength: 20,    // Độ dài tối thiểu của câu để xem xét
  maxParagraphsToProcess: 5000, // Số lượng tối đa đoạn văn tham khảo để xử lý (để tránh quá tải bộ nhớ)
  maxResultsToShow: 50,     // Số lượng kết quả trùng lặp tối đa để hiển thị
  maxPreviewLength: 300     // Độ dài tối đa của đoạn văn để hiển thị
};

// Đảm bảo thư mục kết quả tồn tại
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * So sánh hai chuỗi và trả về độ tương đồng (tỷ lệ phần trăm)
 * @param {string} str1 - Chuỗi thứ nhất
 * @param {string} str2 - Chuỗi thứ hai
 * @returns {number} - Độ tương đồng (0-100)
 */
function calculateSimilarity(str1, str2) {
  // Chuẩn hóa cả hai chuỗi
  str1 = str1.toLowerCase().trim();
  str2 = str2.toLowerCase().trim();

  // Nếu một trong hai chuỗi rỗng, trả về 0
  if (!str1.length || !str2.length) {
    return 0;
  }

  // Nếu hai chuỗi giống hệt nhau, trả về 100
  if (str1 === str2) {
    return 100;
  }

  // Tính toán khoảng cách Levenshtein
  const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const substitutionCost = str1[i-1] === str2[j-1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j-1][i] + 1, // xóa
        matrix[j][i-1] + 1, // chèn
        matrix[j-1][i-1] + substitutionCost // thay thế
      );
    }
  }

  const distance = matrix[str2.length][str1.length];
  const maxLength = Math.max(str1.length, str2.length);
  const similarity = (1 - distance / maxLength) * 100;

  return Math.round(similarity);
}

/**
 * So sánh hai đoạn văn bằng cosine similarity
 * @param {string} text1 - Đoạn văn thứ nhất
 * @param {string} text2 - Đoạn văn thứ hai
 * @returns {number} - Độ tương đồng (0-1)
 */
function calculateCosineSimilarity(text1, text2) {
  // Chuẩn hóa văn bản
  text1 = text1.toLowerCase().trim();
  text2 = text2.toLowerCase().trim();

  // Tokenize văn bản thành các từ
  const words1 = text1.split(/\s+/);
  const words2 = text2.split(/\s+/);

  // Tạo từ điển các từ
  const wordDict = {};
  [...words1, ...words2].forEach(word => {
    if (!wordDict[word]) {
      wordDict[word] = true;
    }
  });

  // Tạo vector cho mỗi đoạn văn
  const dictSize = Object.keys(wordDict).length;
  const vector1 = Array(dictSize).fill(0);
  const vector2 = Array(dictSize).fill(0);

  Object.keys(wordDict).forEach((word, index) => {
    vector1[index] = words1.filter(w => w === word).length;
    vector2[index] = words2.filter(w => w === word).length;
  });

  // Tính cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < dictSize; i++) {
    dotProduct += vector1[i] * vector2[i];
    norm1 += vector1[i] * vector1[i];
    norm2 += vector2[i] * vector2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (norm1 * norm2);
}

/**
 * Đọc và xử lý file data.txt theo phương thức tối ưu luồng
 * @param {string} filePath - Đường dẫn đến file dữ liệu (mặc định là data.txt)
 * @returns {Promise<Array<string>>} - Mảng các đoạn văn 
 */
async function readReferenceData(filePath = DATA_FILE_PATH) {
  console.log(`Đọc file dữ liệu tham khảo từ: ${filePath}`);
  
  // Kiểm tra xem file có tồn tại không
  if (!fs.existsSync(filePath)) {
    console.error(`File ${filePath} không tồn tại!`);
    throw new Error(`File ${filePath} không tồn tại!`);
  }
  
  return new Promise((resolve, reject) => {
    try {
      const paragraphs = [];
      let currentParagraph = '';
      
      // Tạo stream đọc để xử lý file lớn hiệu quả
      const readInterface = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity
      });
      
      // Xử lý từng dòng
      readInterface.on('line', (line) => {
        if (line.trim() === '') {
          // Khi gặp dòng trống, hoàn thành một đoạn văn
          if (currentParagraph.trim().length > 50) {
            paragraphs.push(currentParagraph.trim());
          }
          currentParagraph = '';
        } else {
          currentParagraph += ' ' + line.trim();
        }
      });
      
      // Khi hoàn thành
      readInterface.on('close', () => {
        // Kiểm tra đoạn văn cuối cùng
        if (currentParagraph.trim().length > 50) {
          paragraphs.push(currentParagraph.trim());
        }
        console.log(`Đã tải ${paragraphs.length} đoạn văn từ file dữ liệu tham khảo.`);
        resolve(paragraphs);
      });
      
      // Xử lý lỗi
      readInterface.on('error', (error) => {
        console.error(`Lỗi khi đọc file ${filePath}:`, error);
        reject(error);
      });
    } catch (error) {
      console.error(`Lỗi khi xử lý file ${filePath}:`, error);
      reject(error);
    }
  });
}

/**
 * Tạo một cấu trúc chỉ mục tìm kiếm để tối ưu hóa quá trình so sánh
 * @param {Array<string>} paragraphs - Mảng các đoạn văn tham khảo
 * @returns {Object} - Cấu trúc chỉ mục
 */
function createSearchIndex(paragraphs) {
  const startTime = performance.now();
  console.log('Đang tạo chỉ mục tìm kiếm từ dữ liệu tham khảo...');
  
  // Tạo từ điển nghịch đảo để tìm kiếm nhanh
  const index = {
    keywords: new Map(),   // Map từ khóa -> [vị trí đoạn văn]
    paragraphs: paragraphs  // Dữ liệu gốc
  };
  
  // Xây dựng từ điển nghịch đảo
  paragraphs.forEach((paragraph, paraIndex) => {
    // Chuẩn hóa đoạn văn
    const normalizedText = paragraph.toLowerCase().trim();
    
    // Tách thành từ khóa
    const words = normalizedText
      .split(/\s+/)
      .filter(word => word.length > 4);  // Chỉ lấy từ đủ dài
    
    // Thêm từ khóa vào chỉ mục
    const processedWords = new Set(); // Để tránh lặp lại từ khóa
    
    words.forEach(word => {
      if (!processedWords.has(word)) {
        processedWords.add(word);
        
        if (!index.keywords.has(word)) {
          index.keywords.set(word, []);
        }
        
        index.keywords.get(word).push(paraIndex);
      }
    });
  });
  
  const endTime = performance.now();
  console.log(`Đã tạo chỉ mục tìm kiếm trong ${((endTime - startTime) / 1000).toFixed(2)} giây`);
  console.log(`Số lượng từ khóa duy nhất: ${index.keywords.size}`);
  
  return index;
}

/**
 * Tiền xử lý văn bản để tối ưu quá trình so sánh
 * @param {string} text - Văn bản cần xử lý
 * @returns {string} - Văn bản đã được xử lý
 */
function preprocessText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Loại bỏ ký tự đặc biệt (Unicode aware)
    .replace(/\s+/g, ' ');              // Chuẩn hóa khoảng trắng
}

/**
 * Tìm kiếm các đoạn văn tiềm năng từ chỉ mục
 * @param {string} sentence - Câu cần tìm
 * @param {Object} index - Cấu trúc chỉ mục
 * @param {number} maxResults - Số lượng kết quả tối đa
 * @returns {Array<number>} - Mảng các chỉ số đoạn văn tiềm năng
 */
function findPotentialMatches(sentence, index, maxResults = 10) {
  // Tiền xử lý câu
  const processedSentence = preprocessText(sentence);
  
  // Tách thành từ
  const words = processedSentence
    .split(/\s+/)
    .filter(word => word.length > 4); // Chỉ lấy từ có ý nghĩa
  
  // Đếm tần suất xuất hiện của mỗi đoạn văn
  const paraFrequency = new Map();
  
  // Quét qua từng từ trong câu
  words.forEach(word => {
    // Tìm các đoạn văn chứa từ này
    const paragraphs = index.keywords.get(word) || [];
    
    // Cập nhật tần suất
    paragraphs.forEach(paraIndex => {
      paraFrequency.set(paraIndex, (paraFrequency.get(paraIndex) || 0) + 1);
    });
  });
  
  // Sắp xếp theo tần suất giảm dần và lấy các kết quả tốt nhất
  return [...paraFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
    .slice(0, maxResults);
}

/**
 * Kiểm tra đạo văn từ một đoạn văn bản so với file data.txt
 * @param {string} text - Đoạn văn cần kiểm tra
 * @param {Object} options - Tùy chọn kiểm tra
 * @returns {Promise<Object>} - Kết quả kiểm tra
 */
async function checkPlagiarism(text, options = {}) {
  const startTime = performance.now();
  
  try {
    // Kết hợp tùy chọn với cấu hình mặc định
    const config = { ...DEFAULT_CONFIG, ...options };
    const { threshold, minSentenceLength, maxResultsToShow } = config;
    
    console.log(`Thiết lập: Ngưỡng phát hiện = ${threshold}%, Độ dài tối thiểu = ${minSentenceLength}`);
    
    // Đọc dữ liệu tham khảo
    const paragraphs = await readReferenceData();
    
    // Giới hạn số lượng đoạn văn tham khảo để tránh quá tải bộ nhớ
    const limitedParagraphs = paragraphs.slice(0, config.maxParagraphsToProcess);
    if (paragraphs.length > config.maxParagraphsToProcess) {
      console.warn(`Giới hạn xử lý ${config.maxParagraphsToProcess}/${paragraphs.length} đoạn văn để tiết kiệm bộ nhớ`);
    }
    
    // Tạo chỉ mục tìm kiếm
    const searchIndex = createSearchIndex(limitedParagraphs);
    
    // Kết quả
    const result = {
      isPlagiarized: false,
      matches: [],
      highestSimilarity: 0,
      similarities: [],
      processedSentences: 0,
      totalSentences: 0,
      executionTimeMs: 0
    };
    
    // Chia đoạn văn cần kiểm tra thành các câu
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > minSentenceLength);
    
    result.totalSentences = sentences.length;
    
    console.log(`Đang kiểm tra ${sentences.length} câu với ${limitedParagraphs.length} đoạn văn tham khảo...`);
    
    // Theo dõi tiến trình
    const progressInterval = Math.max(1, Math.round(sentences.length / 10));
    
    // Kiểm tra từng câu
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      
      // Hiển thị tiến trình
      if (i % progressInterval === 0 || i === sentences.length - 1) {
        const progress = Math.round((i / sentences.length) * 100);
        console.log(`Đã xử lý ${i + 1}/${sentences.length} câu (${progress}%)...`);
      }
      
      // Tìm các đoạn văn tiềm năng từ chỉ mục
      const potentialMatches = findPotentialMatches(sentence, searchIndex);
      
      let highestSimilarity = 0;
      let bestMatch = null;
      
      // Chỉ so sánh với các đoạn văn tiềm năng
      for (const paraIndex of potentialMatches) {
        const paragraph = limitedParagraphs[paraIndex];
        
        // Tính toán độ tương đồng
        const similarity = calculateCosineSimilarity(sentence, paragraph);
        const similarityPercent = Math.round(similarity * 100);
        
        if (similarityPercent > highestSimilarity) {
          highestSimilarity = similarityPercent;
          bestMatch = { text: paragraph, index: paraIndex };
        }
      }
      
      // Lưu kết quả
      result.similarities.push(highestSimilarity);
      result.processedSentences++;
      
      if (highestSimilarity >= threshold) {
        result.isPlagiarized = true;
        result.matches.push({
          inputText: sentence,
          matchedText: bestMatch.text,
          sourceIndex: bestMatch.index,
          similarity: highestSimilarity
        });
        
        // Giới hạn số lượng kết quả
        if (result.matches.length >= maxResultsToShow) {
          console.warn(`Đạt giới hạn số lượng kết quả (${maxResultsToShow}), bỏ qua các kết quả khác`);
          break;
        }
      }
      
      // Cập nhật độ tương đồng cao nhất
      if (highestSimilarity > result.highestSimilarity) {
        result.highestSimilarity = highestSimilarity;
      }
    }
      // Sắp xếp các kết quả phát hiện theo độ tương đồng từ cao xuống thấp
    if (result.matches.length > 0) {
      result.matches.sort((a, b) => b.similarity - a.similarity);
      
      // Cập nhật lại điểm cao nhất sau khi sắp xếp
      result.highestSimilarity = result.matches[0].similarity;
    }
    
    // Tính điểm đạo văn tổng thể
    result.overallScore = result.similarities.length > 0
      ? Math.round(result.similarities.reduce((sum, val) => sum + val, 0) / result.similarities.length)
      : 0;
    
    const endTime = performance.now();
    result.executionTimeMs = endTime - startTime;
    result.executionTimeFormatted = `${(result.executionTimeMs / 1000).toFixed(2)} giây`;
    
    console.log(`Hoàn thành kiểm tra trong ${result.executionTimeFormatted}`);
    
    if (result.isPlagiarized) {
      console.log(`Phát hiện ${result.matches.length} nguồn đạo văn, độ tương đồng cao nhất: ${result.highestSimilarity}%`);
    }
    
    return result;
  } catch (error) {
    console.error('Lỗi khi kiểm tra đạo văn:', error);
    throw error;
  }
}

/**
 * Kiểm tra đạo văn từ file văn bản
 * @param {string} filePath - Đường dẫn đến file cần kiểm tra
 * @param {Object} options - Các tùy chọn
 * @returns {Promise<Object>} - Kết quả kiểm tra
 */
async function checkPlagiarismFromFile(filePath, options = {}) {
  console.log(`Đọc nội dung từ file: ${filePath}`);
  
  try {
    // Kiểm tra file tồn tại
    if (!fs.existsSync(filePath)) {
      throw new Error(`Không tìm thấy file: ${filePath}`);
    }
    
    // Đọc nội dung file
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`Đã đọc ${content.length} ký tự từ file.`);
    
    // Kiểm tra đạo văn
    return await checkPlagiarism(content, options);
  } catch (error) {
    console.error(`Lỗi khi đọc hoặc xử lý file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Xuất kết quả kiểm tra đạo văn ra file
 * @param {Object} result - Kết quả kiểm tra
 * @param {string} outputPath - Đường dẫn file đầu ra (nếu không cung cấp sẽ tạo tự động)
 * @returns {string} - Đường dẫn file đầu ra
 */
function exportResultToFile(result, outputPath) {
  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    outputPath = path.join(OUTPUT_DIR, `plagiarism_result_${timestamp}.txt`);
  }
  
  console.log(`Xuất kết quả ra file: ${outputPath}`);
  
  try {
    let content = '=== KẾT QUẢ KIỂM TRA ĐẠO VĂN ===\n';
    content += `Thời gian: ${new Date().toLocaleString()}\n`;
    content += `Thời gian thực thi: ${result.executionTimeFormatted}\n`;
    content += `Số câu phân tích: ${result.processedSentences}/${result.totalSentences}\n`;
    content += `Điểm đạo văn tổng thể: ${result.overallScore}%\n`;
    content += `Độ tương đồng cao nhất: ${result.highestSimilarity}%\n\n`;
      if (result.isPlagiarized) {
      content += `=== PHÁT HIỆN ${result.matches.length} ĐOẠN CÓ KHẢ NĂNG ĐẠO VĂN ===\n`;
      content += `(Đã sắp xếp theo độ tương đồng từ cao xuống thấp)\n\n`;
      
      result.matches.forEach((match, index) => {
        content += `--- Kết quả #${index + 1} (Độ tương đồng: ${match.similarity}%) ---\n\n`;
        content += `Đoạn văn của bạn:\n"${match.inputText.trim()}"\n\n`;
        content += `Khớp với đoạn văn tham khảo:\n"${match.matchedText.substring(0, DEFAULT_CONFIG.maxPreviewLength)}${
          match.matchedText.length > DEFAULT_CONFIG.maxPreviewLength ? '...' : ''
        }"\n\n`;
        content += '--------------------------------------------------------\n\n';
      });
    } else {
      content += '=== KHÔNG PHÁT HIỆN ĐẠO VĂN ===\n';
      content += 'Đoạn văn của bạn có tính độc đáo cao.\n\n';
    }
    
    // Thêm thông tin thống kê chi tiết
    content += '=== THỐNG KÊ CHI TIẾT ===\n';
    content += `Độ tương đồng trung bình: ${result.overallScore}%\n`;
    
    // Tạo thư mục nếu chưa tồn tại
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Ghi file
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`Đã ghi kết quả ra file: ${outputPath}`);
    
    return outputPath;
  } catch (error) {
    console.error(`Lỗi khi xuất kết quả ra file:`, error);
    throw error;
  }
}

/**
 * In kết quả kiểm tra đạo văn ra console
 * @param {Object} result - Kết quả kiểm tra
 * @param {Object} options - Tùy chọn hiển thị
 */
function printResult(result, options = {}) {
  const { maxPreviewLength = DEFAULT_CONFIG.maxPreviewLength } = options;
  
  console.log('\n=== KẾT QUẢ KIỂM TRA ===');
  console.log(`Thời gian thực thi: ${result.executionTimeFormatted}`);
  console.log(`Số câu phân tích: ${result.processedSentences}/${result.totalSentences}`);
  console.log(`Độ tương đồng tổng thể: ${result.overallScore}%`);
  console.log(`Độ tương đồng cao nhất: ${result.highestSimilarity}%`);
    if (result.isPlagiarized) {
    console.log(`\nPhát hiện ${result.matches.length} đoạn có khả năng đạo văn!`);
    console.log('(Đã sắp xếp theo độ tương đồng từ cao xuống thấp)');
    
    // Hiển thị kết quả phát hiện đạo văn
    result.matches.forEach((match, index) => {
      console.log(`\n${index + 1}. Đoạn văn của bạn (Độ tương đồng: ${match.similarity}%):`);
      console.log(`"${match.inputText.trim()}"`);
      console.log('\nKhớp với đoạn văn tham khảo:');
      console.log(`"${match.matchedText.substring(0, maxPreviewLength)}${match.matchedText.length > maxPreviewLength ? '...' : ''}"`);
      console.log('--------------------------------------');
    });
  } else {
    console.log('\nKhông phát hiện đạo văn. Đoạn văn của bạn có tính độc đáo cao.');
  }
}

/**
 * Hiển thị hướng dẫn sử dụng công cụ
 */
function printUsage() {
  console.log('=== CÔNG CỤ KIỂM TRA ĐẠO VĂN TRỰC TIẾP ===');
  console.log('Sử dụng:');
  console.log('  node check-plagiarism-direct.js [tùy chọn]');
  console.log('\nTùy chọn:');
  console.log('  --file=<đường-dẫn>   : Kiểm tra đạo văn từ file văn bản');
  console.log('  --output=<đường-dẫn> : Lưu kết quả vào file');
  console.log('  --threshold=<số>     : Ngưỡng phát hiện đạo văn (mặc định: 60%)');
  console.log('  --interactive        : Chế độ tương tác (nhập văn bản từ bàn phím)');
  console.log('  --help               : Hiển thị hướng dẫn này');
  console.log('\nVí dụ:');
  console.log('  node check-plagiarism-direct.js --interactive');
  console.log('  node check-plagiarism-direct.js --file=myfile.txt --threshold=70');
}

/**
 * Đọc văn bản từ người dùng
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<string>} - Văn bản đã nhập
 */
async function readFromUser(rl) {
  let inputText = '';
  
  console.log('Nhập đoạn văn bản (nhập dòng trống để kết thúc nhập):');
  
  return new Promise((resolve) => {
    const listener = (line) => {
      if (line === '') {
        rl.removeListener('line', listener);
        resolve(inputText);
      } else if (line.toLowerCase() === 'q') {
        console.log('Thoát chương trình.');
        rl.close();
        process.exit(0);
      } else {
        inputText += line + '\n';
      }
    };
    
    rl.on('line', listener);
  });
}

/**
 * Hàm chính - xử lý tương tác hoặc tham số dòng lệnh
 */
async function main() {
  // Xử lý các tham số dòng lệnh
  const args = process.argv.slice(2);
  
  // Phân tích tham số
  const params = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      params[key] = value !== undefined ? value : true;
    }
  });
  
  // Hiển thị hướng dẫn
  if (params.help) {
    printUsage();
    return;
  }
  
  // Thiết lập tùy chọn
  const options = {
    threshold: params.threshold ? parseInt(params.threshold) : DEFAULT_CONFIG.threshold
  };
  
  // Mở đầu
  console.log('=== KIỂM TRA ĐẠO VĂN TRỰC TIẾP ===');
  console.log(`Ngày: ${new Date().toLocaleDateString()}`);
  console.log(`Ngưỡng phát hiện: ${options.threshold}%`);
  console.log('--------------------------------------');
  
  // Nếu có file đầu vào
  if (params.file) {
    try {
      console.log(`Kiểm tra đạo văn từ file: ${params.file}`);
      const result = await checkPlagiarismFromFile(params.file, options);
      
      // In kết quả ra console
      printResult(result);
      
      // Nếu chỉ định file đầu ra, xuất kết quả
      if (params.output) {
        exportResultToFile(result, params.output);
      } else {
        // Tự động xuất kết quả với tên file dựa theo file đầu vào
        const inputBasename = path.basename(params.file, path.extname(params.file));
        const outputPath = path.join(OUTPUT_DIR, `${inputBasename}_result.txt`);
        exportResultToFile(result, outputPath);
      }
    } catch (error) {
      console.error('Lỗi:', error);
      process.exit(1);
    }
    return;
  }
  
  // Chế độ tương tác
  if (params.interactive || Object.keys(params).length === 0) {
    console.log('Chế độ tương tác: Nhập đoạn văn bản để kiểm tra. Nhập "q" để thoát.');
    
    // Tạo readline interface để đọc input từ người dùng
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Lặp để người dùng có thể kiểm tra nhiều đoạn văn
    while (true) {
      const inputText = await readFromUser(rl);
      
      if (inputText.trim() === '') {
        console.log('Đoạn văn rỗng. Vui lòng nhập lại hoặc nhập "q" để thoát.');
        continue;
      }
      
      console.log('\nĐang kiểm tra đạo văn...');
      
      try {
        const result = await checkPlagiarism(inputText, options);
        
        // In kết quả
        printResult(result);
        
        // Tự động lưu kết quả
        const timestamp = new Date().toISOString().replace(/:/g, '-').substr(0, 19);
        exportResultToFile(result, path.join(OUTPUT_DIR, `interactive_result_${timestamp}.txt`));
        
        console.log('\nNhấn Enter để tiếp tục kiểm tra đoạn văn mới, hoặc nhập "q" để thoát.');
      } catch (error) {
        console.error('Lỗi khi kiểm tra đạo văn:', error);
      }
    }
  } else {
    console.log('Vui lòng cung cấp file đầu vào hoặc sử dụng chế độ tương tác.');
    printUsage();
  }
}

// Chỉ chạy chương trình khi được gọi trực tiếp (không phải qua require)
if (require.main === module) {
  main().catch(error => {
    console.error('Lỗi chung:', error);
    process.exit(1);
  });
}

// Export các hàm để có thể sử dụng từ file khác
module.exports = {
  checkPlagiarism,
  checkPlagiarismFromFile,
  readReferenceData,
  calculateCosineSimilarity,
  calculateSimilarity,
  exportResultToFile,
  DEFAULT_CONFIG
};
