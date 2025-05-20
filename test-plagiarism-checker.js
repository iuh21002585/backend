/**
 * Script kiểm thử cho công cụ phát hiện đạo văn
 * Script này thực hiện kiểm tra hiệu suất và độ chính xác của hệ thống phát hiện đạo văn
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Import các hàm từ file check-plagiarism-direct
// Lưu ý: Chúng ta cần sửa file check-plagiarism-direct.js để export các hàm cần thiết
// Tạm thời dùng cách thiết lập lại hàm checkPlagiarism
const path = require('path');
const { checkPlagiarism } = require('./check-plagiarism-direct');

// Nếu bị lỗi khi import, định nghĩa thủ công để kiểm thử
if (!checkPlagiarism) {
  console.warn('Không thể import trực tiếp hàm checkPlagiarism, thiết lập lại hàm thủ công');
  
  // Tìm và thực thi file
  const plagiarismScript = path.resolve(__dirname, 'check-plagiarism-direct.js');
  console.log(`Đang tìm script tại: ${plagiarismScript}`);
  
  try {
    // Đọc nội dung file
    const scriptContent = fs.readFileSync(plagiarismScript, 'utf-8');
    
    // Tách hàm checkPlagiarism từ nội dung file
    // Đây là giải pháp tạm thời, nên sửa file check-plagiarism-direct.js để export các hàm đúng cách
    eval(`
      ${scriptContent}
      global.checkPlagiarism = checkPlagiarism;
    `);
    
    console.log('Thiết lập hàm checkPlagiarism thành công');
  } catch (error) {
    console.error('Lỗi khi thiết lập hàm checkPlagiarism:', error);
    process.exit(1);
  }
}

// Thư mục lưu kết quả kiểm thử
const TEST_OUTPUT_DIR = path.join(__dirname, 'test_results');
if (!fs.existsSync(TEST_OUTPUT_DIR)) {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

/**
 * Tạo mẫu văn bản kiểm thử từ file data.txt
 * @param {number} numSamples - Số lượng mẫu
 * @param {number} sampleLength - Độ dài của mỗi mẫu (số ký tự)
 * @returns {Array<{ text: string, source: string }>} - Mảng mẫu văn bản
 */
async function generateTestSamples(numSamples = 5, sampleLength = 500) {
  console.log(`Đang tạo ${numSamples} mẫu kiểm thử, mỗi mẫu có độ dài ${sampleLength} ký tự...`);
  
  // Đọc file data.txt
  const dataFilePath = path.join(__dirname, 'reference_database', 'data.txt');
  const content = fs.readFileSync(dataFilePath, 'utf-8');
  
  // Chia thành các đoạn
  const paragraphs = content
    .split(/\n\s*\n/)
    .filter(p => p.trim().length > 100)
    .map(p => p.trim());
  
  if (paragraphs.length < numSamples) {
    console.warn(`Không đủ đoạn văn để tạo ${numSamples} mẫu. Chỉ có thể tạo ${paragraphs.length} mẫu.`);
    numSamples = paragraphs.length;
  }
  
  // Chọn ngẫu nhiên các đoạn văn để làm mẫu
  const samples = [];
  const usedIndexes = new Set();
  
  for (let i = 0; i < numSamples; i++) {
    let randomIndex;
    // Đảm bảo không chọn trùng đoạn văn
    do {
      randomIndex = Math.floor(Math.random() * paragraphs.length);
    } while (usedIndexes.has(randomIndex));
    
    usedIndexes.add(randomIndex);
    const paragraph = paragraphs[randomIndex];
    
    // Cắt đoạn văn nếu quá dài
    const sampleText = paragraph.length > sampleLength 
      ? paragraph.substring(0, sampleLength) 
      : paragraph;
    
    samples.push({
      text: sampleText,
      source: `data.txt (đoạn ${randomIndex + 1})`,
      index: randomIndex
    });
  }
  
  console.log(`Đã tạo ${samples.length} mẫu kiểm thử.`);
  return samples;
}

/**
 * Tạo các biến thể của mẫu văn bản (thay đổi nhẹ để kiểm tra khả năng phát hiện)
 * @param {string} text - Văn bản gốc
 * @returns {Object} - Các biến thể
 */
function createVariations(text) {
  // Chuẩn hóa văn bản
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  
  // Tách thành các từ
  const words = normalizedText.split(' ');
  
  // Biến thể 1: Thay đổi thứ tự một số từ
  let variant1 = [...words];
  for (let i = 0; i < Math.min(5, Math.floor(words.length / 10)); i++) {
    const idx1 = Math.floor(Math.random() * words.length);
    const idx2 = Math.floor(Math.random() * words.length);
    [variant1[idx1], variant1[idx2]] = [variant1[idx2], variant1[idx1]];
  }
  
  // Biến thể 2: Thay thế một số từ
  const replacements = {
    'và': 'cùng với',
    'nhưng': 'tuy nhiên',
    'là': 'chính là',
    'có': 'sở hữu',
    'không': 'chẳng',
    'trong': 'ở trong',
    'của': 'thuộc về',
    'với': 'cùng',
    'cho': 'dành cho'
  };
  
  let variant2 = [...words];
  Object.keys(replacements).forEach(word => {
    for (let i = 0; i < variant2.length; i++) {
      if (variant2[i].toLowerCase() === word) {
        variant2[i] = replacements[word];
      }
    }
  });
  
  // Biến thể 3: Thêm một số từ
  let variant3 = [...words];
  const additions = ['thật ra', 'về cơ bản', 'theo đó', 'nói cách khác', 'cụ thể là'];
  for (let i = 0; i < Math.min(3, Math.floor(words.length / 20)); i++) {
    const position = Math.floor(Math.random() * variant3.length);
    const addition = additions[Math.floor(Math.random() * additions.length)];
    variant3.splice(position, 0, addition);
  }
  
  return {
    original: normalizedText,
    wordOrderChanged: variant1.join(' '),
    wordReplaced: variant2.join(' '),
    wordAdded: variant3.join(' ')
  };
}

/**
 * Chạy kiểm thử phát hiện đạo văn
 */
async function runPlagiarismTests() {
  console.log('=== KIỂM THỬ CÔNG CỤ PHÁT HIỆN ĐẠO VĂN ===');
  
  try {
    // Tạo mẫu kiểm thử
    const samples = await generateTestSamples(3, 600);
    
    // Kết quả kiểm thử
    const results = {
      tests: [],
      summary: {
        totalTests: 0,
        correctDetections: 0,
        falsePositives: 0,
        falseNegatives: 0,
        avgExecutionTime: 0
      }
    };
    
    // Định nghĩa các ngưỡng kiểm thử
    const thresholds = [50, 60, 70, 80];
    
    // Thực hiện kiểm thử với mỗi mẫu và biến thể
    for (const sample of samples) {
      console.log(`\nKiểm thử với mẫu từ nguồn: ${sample.source}`);
      
      // Tạo biến thể
      const variants = createVariations(sample.text);
      
      // Kiểm thử với mỗi biến thể
      for (const [variantName, variantText] of Object.entries(variants)) {
        console.log(`\n--- Kiểm thử biến thể: ${variantName} ---`);
        
        // Kiểm thử với các ngưỡng khác nhau
        for (const threshold of thresholds) {
          const testResult = {
            variant: variantName,
            threshold: threshold,
            text: variantText.substring(0, 100) + '...',
            expectedToBeDetected: true, // Mong đợi phát hiện đạo văn
            wasDetected: false,
            executionTime: 0,
            similarityScore: 0
          };
          
          // Đo thời gian thực thi
          const startTime = performance.now();
          
          // Thực hiện kiểm tra đạo văn
          try {
            const checkResult = await plagiarismChecker.checkPlagiarism(variantText, { threshold });
            
            testResult.wasDetected = checkResult.isPlagiarized;
            testResult.similarityScore = checkResult.overallScore;
            testResult.executionTime = checkResult.executionTimeMs;
            
            console.log(`Ngưỡng ${threshold}%: ${checkResult.isPlagiarized ? 'PHÁT HIỆN' : 'KHÔNG PHÁT HIỆN'} - Độ tương đồng: ${checkResult.overallScore}% (${(checkResult.executionTimeMs/1000).toFixed(2)}s)`);
            
            // Cập nhật kết quả
            results.tests.push(testResult);
            results.summary.totalTests++;
            
            if (testResult.expectedToBeDetected && testResult.wasDetected) {
              results.summary.correctDetections++;
            } else if (testResult.expectedToBeDetected && !testResult.wasDetected) {
              results.summary.falseNegatives++;
            } else if (!testResult.expectedToBeDetected && testResult.wasDetected) {
              results.summary.falsePositives++;
            }
            
          } catch (error) {
            console.error(`Lỗi khi kiểm thử biến thể ${variantName} với ngưỡng ${threshold}%:`, error);
          }
        }
      }
    }
    
    // Tính toán thống kê
    results.summary.avgExecutionTime = results.tests.reduce((sum, test) => sum + test.executionTime, 0) / results.tests.length;
    results.summary.avgExecutionTimeFormatted = `${(results.summary.avgExecutionTime / 1000).toFixed(2)} giây`;
    
    // Hiển thị tóm tắt
    console.log('\n=== TÓM TẮT KẾT QUẢ KIỂM THỬ ===');
    console.log(`Tổng số kiểm thử: ${results.summary.totalTests}`);
    console.log(`Phát hiện chính xác: ${results.summary.correctDetections} (${((results.summary.correctDetections / results.summary.totalTests) * 100).toFixed(2)}%)`);
    console.log(`Lỗi âm tính giả (bỏ sót đạo văn): ${results.summary.falseNegatives} (${((results.summary.falseNegatives / results.summary.totalTests) * 100).toFixed(2)}%)`);
    console.log(`Lỗi dương tính giả (nhận định sai đạo văn): ${results.summary.falsePositives} (${((results.summary.falsePositives / results.summary.totalTests) * 100).toFixed(2)}%)`);
    console.log(`Thời gian thực thi trung bình: ${results.summary.avgExecutionTimeFormatted}`);
    
    // Xuất kết quả ra file
    const timestamp = new Date().toISOString().replace(/:/g, '-').substr(0, 19);
    const resultFile = path.join(TEST_OUTPUT_DIR, `test_results_${timestamp}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nĐã lưu kết quả kiểm thử chi tiết vào file: ${resultFile}`);
    
  } catch (error) {
    console.error('Lỗi khi thực hiện kiểm thử:', error);
  }
}

// Kiểm thử với văn bản không đạo văn
async function testNonPlagiarizedText() {
  console.log('\n=== KIỂM THỬ VỚI VĂN BẢN KHÔNG ĐẠO VĂN ===');
  
  // Văn bản mới hoàn toàn
  const originalText = `
    Công nghệ thông tin ngày nay đang phát triển nhanh chóng và mạnh mẽ. 
    Các công nghệ mới như trí tuệ nhân tạo, học máy và blockchain đang làm thay đổi cách 
    chúng ta sống và làm việc. Trong lĩnh vực giáo dục, công nghệ cũng mang lại nhiều thay đổi tích cực,
    giúp người học tiếp cận kiến thức dễ dàng hơn. Tuy nhiên, bên cạnh những lợi ích, 
    việc lạm dụng công nghệ cũng mang lại nhiều thách thức cho xã hội hiện đại.
  `;
  
  try {
    // Kiểm tra với ngưỡng khác nhau
    for (const threshold of [50, 60, 70]) {
      console.log(`\nKiểm tra với ngưỡng ${threshold}%...`);
      
      const result = await plagiarismChecker.checkPlagiarism(originalText, { threshold });
      
      console.log(`Kết quả: ${result.isPlagiarized ? 'PHÁT HIỆN đạo văn' : 'KHÔNG PHÁT HIỆN đạo văn'}`);
      console.log(`Độ tương đồng: ${result.overallScore}%`);
      console.log(`Thời gian thực thi: ${(result.executionTimeMs/1000).toFixed(2)} giây`);
    }
  } catch (error) {
    console.error('Lỗi khi kiểm thử văn bản không đạo văn:', error);
  }
}

// Hàm chính
async function main() {
  try {
    // Kiểm thử phát hiện đạo văn
    await runPlagiarismTests();
    
    // Kiểm thử với văn bản không đạo văn
    await testNonPlagiarizedText();
    
    console.log('\n=== HOÀN THÀNH KIỂM THỬ ===');
  } catch (error) {
    console.error('Lỗi chung:', error);
  }
}

// Chạy kiểm thử
main().catch(console.error);
