#!/usr/bin/env node
/**
 * Command-line interface cho công cụ kiểm tra đạo văn
 * 
 * Script này cung cấp một giao diện dòng lệnh thân thiện cho công cụ kiểm tra đạo văn
 * Hỗ trợ các chức năng:
 * - Kiểm tra đạo văn từ văn bản hoặc file
 * - Kiểm tra trạng thái xử lý luận văn
 * - Hiển thị thống kê hệ thống
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec, spawn } = require('child_process');
const { performance } = require('perf_hooks');
const chalk = require('chalk'); // Để hiển thị màu sắc trong terminal

// Import công cụ kiểm tra đạo văn
const {
  checkPlagiarism,
  checkPlagiarismFromFile,
  exportResultToFile,
  DEFAULT_CONFIG
} = require('./check-plagiarism-direct');

// Định nghĩa lệnh và mô tả
const COMMANDS = {
  check: {
    description: 'Kiểm tra đạo văn từ văn bản hoặc file',
    usage: 'plagiarism-cli check [--file=<file-path>] [--threshold=<number>] [--output=<file-path>]'
  },
  status: {
    description: 'Kiểm tra trạng thái xử lý luận văn',
    usage: 'plagiarism-cli status [--id=<thesis-id>] [--detailed]'
  },
  stats: {
    description: 'Hiển thị thống kê hệ thống',
    usage: 'plagiarism-cli stats'
  },
  test: {
    description: 'Chạy kiểm thử công cụ phát hiện đạo văn',
    usage: 'plagiarism-cli test'
  },
  help: {
    description: 'Hiển thị trợ giúp',
    usage: 'plagiarism-cli help [command]'
  }
};

/**
 * Hiển thị trợ giúp cho một lệnh cụ thể
 * @param {string} command - Tên lệnh
 */
function displayHelp(command) {
  console.log(chalk.cyan('=== CÔNG CỤ KIỂM TRA ĐẠO VĂN IUH PLAGCHECK ==='));
  
  if (command && COMMANDS[command]) {
    // Hiển thị trợ giúp cho lệnh cụ thể
    console.log(`\n${chalk.yellow(command)}: ${COMMANDS[command].description}`);
    console.log(`\nCách sử dụng: ${chalk.green(COMMANDS[command].usage)}`);
    
    // Hiển thị thêm thông tin chi tiết cho từng lệnh
    switch(command) {
      case 'check':
        console.log('\nTùy chọn:');
        console.log('  --file=<file-path>   : Đường dẫn đến file văn bản cần kiểm tra');
        console.log('  --threshold=<number> : Ngưỡng phát hiện đạo văn (mặc định: 60%)');
        console.log('  --output=<file-path> : Đường dẫn file kết quả');
        console.log('\nVí dụ:');
        console.log(chalk.green('  plagiarism-cli check --file=myfile.txt --threshold=70'));
        console.log(chalk.green('  plagiarism-cli check  # Chế độ tương tác'));
        break;
        
      case 'status':
        console.log('\nTùy chọn:');
        console.log('  --id=<thesis-id> : ID của luận văn cần kiểm tra trạng thái');
        console.log('  --detailed       : Hiển thị thông tin chi tiết');
        console.log('\nVí dụ:');
        console.log(chalk.green('  plagiarism-cli status --id=60a1b2c3d4e5f6g7h8i9j0'));
        console.log(chalk.green('  plagiarism-cli status  # Hiển thị tất cả'));
        break;
        
      case 'stats':
        console.log('\nHiển thị thông kê về hệ thống phát hiện đạo văn, bao gồm:');
        console.log('  - Số lượng luận văn đã xử lý');
        console.log('  - Thời gian xử lý trung bình');
        console.log('  - Tỷ lệ phát hiện đạo văn');
        break;
        
      case 'test':
        console.log('\nChạy các kiểm thử để đánh giá độ chính xác của công cụ phát hiện đạo văn.');
        break;
    }
  } else {
    // Hiển thị trợ giúp chung
    console.log('\nCác lệnh có sẵn:');
    Object.entries(COMMANDS).forEach(([cmd, info]) => {
      console.log(`  ${chalk.yellow(cmd.padEnd(10))} : ${info.description}`);
    });
    
    console.log('\nĐể biết thêm chi tiết về một lệnh, hãy chạy:');
    console.log(chalk.green('  plagiarism-cli help <command>'));
  }
  
  console.log('\nDeveloped for IUH PLAGCHECK System');
}

/**
 * Phân tích tham số dòng lệnh
 * @returns {Object} - Các tham số đã phân tích
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const params = {};
  
  // Phân tích các tham số
  args.slice(1).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      params[key] = value !== undefined ? value : true;
    }
  });
  
  return { command, params };
}

/**
 * Chạy công cụ kiểm tra đạo văn
 * @param {Object} params - Tham số
 */
async function runPlagiarismCheck(params) {
  console.log(chalk.cyan('=== KIỂM TRA ĐẠO VĂN ==='));
  
  // Thiết lập các tùy chọn
  const options = {
    threshold: params.threshold ? parseInt(params.threshold) : DEFAULT_CONFIG.threshold
  };
  
  console.log(`Ngưỡng phát hiện: ${chalk.yellow(options.threshold)}%`);
  
  // Nếu có file đầu vào
  if (params.file) {
    try {
      const filePath = params.file;
      console.log(`Kiểm tra file: ${chalk.green(filePath)}`);
      
      // Kiểm tra đạo văn
      const result = await checkPlagiarismFromFile(filePath, options);
      
      // In kết quả
      displayPlagiarismResult(result);
      
      // Nếu chỉ định file đầu ra, xuất kết quả
      if (params.output) {
        await exportResultToFile(result, params.output);
        console.log(`Đã lưu kết quả vào file: ${chalk.green(params.output)}`);
      } else {
        // Tự động xuất kết quả với tên file dựa theo file đầu vào
        const inputBasename = path.basename(filePath, path.extname(filePath));
        const outputDir = path.join(__dirname, 'plagiarism_results');
        const outputPath = path.join(outputDir, `${inputBasename}_result.txt`);
        
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        await exportResultToFile(result, outputPath);
        console.log(`Đã lưu kết quả vào file: ${chalk.green(outputPath)}`);
      }
    } catch (error) {
      console.error(chalk.red(`Lỗi: ${error.message}`));
    }
    return;
  }
  
  // Chế độ tương tác
  console.log(chalk.yellow('Chế độ tương tác: Nhập đoạn văn bản để kiểm tra. Nhập dòng trống để kết thúc. Nhập "q" để thoát.'));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Lặp để kiểm tra nhiều đoạn văn
  while (true) {
    // Đọc văn bản từ người dùng
    let inputText = '';
    
    console.log(chalk.yellow('\nNhập đoạn văn bản (nhập dòng trống để kết thúc nhập):'));
    
    while (true) {
      const line = await new Promise(resolve => rl.question('> ', resolve));
      
      if (line === '') {
        break;
      } else if (line.toLowerCase() === 'q') {
        console.log('Thoát chương trình.');
        rl.close();
        return;
      }
      
      inputText += line + '\n';
    }
    
    if (inputText.trim() === '') {
      console.log(chalk.yellow('Đoạn văn rỗng. Vui lòng nhập lại hoặc nhập "q" để thoát.'));
      continue;
    }
    
    console.log(chalk.yellow('\nĐang kiểm tra đạo văn...'));
    
    try {
      // Thực hiện kiểm tra đạo văn
      const result = await checkPlagiarism(inputText, options);
      
      // Hiển thị kết quả
      displayPlagiarismResult(result);
      
      // Tự động lưu kết quả
      const timestamp = new Date().toISOString().replace(/:/g, '-').substring(0, 19);
      const outputDir = path.join(__dirname, 'plagiarism_results');
      const outputPath = path.join(outputDir, `interactive_result_${timestamp}.txt`);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      await exportResultToFile(result, outputPath);
      console.log(`Đã lưu kết quả vào file: ${chalk.green(outputPath)}`);
      
      console.log(chalk.yellow('\nNhấn Enter để tiếp tục kiểm tra đoạn văn mới, hoặc nhập "q" để thoát.'));
    } catch (error) {
      console.error(chalk.red(`Lỗi: ${error.message}`));
    }
  }
}

/**
 * Hiển thị kết quả kiểm tra đạo văn
 * @param {Object} result - Kết quả kiểm tra
 */
function displayPlagiarismResult(result) {
  console.log(chalk.cyan('\n=== KẾT QUẢ KIỂM TRA ==='));
  console.log(`Thời gian thực thi: ${chalk.yellow(result.executionTimeFormatted || '(không có)')}`);
  console.log(`Số câu phân tích: ${chalk.yellow(result.processedSentences || '?')}/${result.totalSentences || '?'}`);
  console.log(`Độ tương đồng tổng thể: ${chalk.yellow(result.overallScore + '%')}`);
  
  if (result.isPlagiarized) {
    console.log(chalk.red(`\nPhát hiện ${result.matches.length} đoạn có khả năng đạo văn!`));
    
    // Hiển thị chi tiết kết quả
    result.matches.forEach((match, index) => {
      console.log(chalk.yellow(`\n${index + 1}. Đoạn văn của bạn (Độ tương đồng: ${match.similarity}%):`));
      console.log(chalk.white(`"${match.inputText.trim()}"`));
      console.log(chalk.yellow('\nKhớp với đoạn văn tham khảo:'));
      console.log(chalk.gray(`"${match.matchedText.substring(0, 300)}${match.matchedText.length > 300 ? '...' : ''}"`));
      console.log(chalk.yellow('--------------------------------------'));
    });
  } else {
    console.log(chalk.green('\nKhông phát hiện đạo văn. Đoạn văn của bạn có tính độc đáo cao.'));
  }
}

/**
 * Kiểm tra trạng thái xử lý luận văn
 * @param {Object} params - Tham số
 */
async function checkThesisStatus(params) {
  console.log(chalk.cyan('=== KIỂM TRA TRẠNG THÁI LUẬN VĂN ==='));
  
  try {
    // Nếu có ID cụ thể
    if (params.id) {
      console.log(`Kiểm tra luận văn ID: ${chalk.yellow(params.id)}`);
      
      // Thực hiện kiểm tra status từ database
      const statusScript = path.join(__dirname, 'check-thesis-status.js');
      
      if (fs.existsSync(statusScript)) {
        // Tạo child process để chạy script
        const child = spawn('node', [statusScript, params.id], {
          stdio: 'inherit'
        });
        
        // Đợi script hoàn thành
        await new Promise((resolve, reject) => {
          child.on('close', code => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Script exited with code ${code}`));
            }
          });
          
          child.on('error', reject);
        });
      } else {
        console.error(chalk.red(`Không tìm thấy script: ${statusScript}`));
      }
    } else {
      // Nếu không có ID, hiển thị trạng thái tổng quan
      console.log(chalk.yellow('Kiểm tra tất cả các luận văn đang xử lý...'));
      
      // Sử dụng script monitor-thesis-status.js
      const monitorScript = path.join(__dirname, 'monitor-thesis-status.js');
      
      if (fs.existsSync(monitorScript)) {
        // Tạo child process để chạy script
        const child = spawn('node', [monitorScript], {
          stdio: 'inherit'
        });
        
        // Đợi script hoàn thành
        await new Promise((resolve, reject) => {
          child.on('close', code => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Script exited with code ${code}`));
            }
          });
          
          child.on('error', reject);
        });
      } else {
        console.error(chalk.red(`Không tìm thấy script: ${monitorScript}`));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Lỗi: ${error.message}`));
  }
}

/**
 * Hiển thị thống kê hệ thống
 */
async function showSystemStats() {
  console.log(chalk.cyan('=== THỐNG KÊ HỆ THỐNG PHÁT HIỆN ĐẠO VĂN ==='));
  
  try {
    // Kiểm tra thông tin file data.txt
    const dataFilePath = path.join(__dirname, 'reference_database', 'data.txt');
    
    if (fs.existsSync(dataFilePath)) {
      const stats = fs.statSync(dataFilePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`File dữ liệu tham khảo: ${chalk.green('Đã tìm thấy')}`);
      console.log(`Kích thước: ${chalk.yellow(fileSizeMB)} MB`);
      console.log(`Thời gian sửa đổi: ${chalk.yellow(stats.mtime.toLocaleString())}`);
      
      // Đọc một phần nhỏ file để xác định số lượng đoạn văn
      const previewContent = fs.readFileSync(dataFilePath, { encoding: 'utf-8', start: 0, end: Math.min(stats.size, 1024 * 1024) });
      const paragraphCount = previewContent.split(/\n\s*\n/).length;
      console.log(`Số lượng đoạn văn (ước tính): ${chalk.yellow('~' + paragraphCount)}`);
    } else {
      console.log(`File dữ liệu tham khảo: ${chalk.red('Không tìm thấy')}`);
    }
    
    // Kiểm tra thư mục kết quả
    const resultsDir = path.join(__dirname, 'plagiarism_results');
    if (fs.existsSync(resultsDir)) {
      const resultFiles = fs.readdirSync(resultsDir);
      console.log(`\nSố lượng kết quả đã lưu: ${chalk.yellow(resultFiles.length)}`);
      
      if (resultFiles.length > 0) {
        const latestFile = resultFiles
          .map(file => ({ name: file, time: fs.statSync(path.join(resultsDir, file)).mtime }))
          .sort((a, b) => b.time - a.time)[0];
          
        console.log(`Kết quả mới nhất: ${chalk.yellow(latestFile.name)} (${latestFile.time.toLocaleString()})`);
      }
    } else {
      console.log(`\nThư mục kết quả: ${chalk.red('Chưa được tạo')}`);
    }
    
    // Kiểm tra xem có kết nối database không
    console.log('\nKiểm tra kết nối database...');
    const dbCheckScript = path.join(__dirname, 'src', 'test-db-connection.js');
    
    if (fs.existsSync(dbCheckScript)) {
      try {
        const result = await new Promise((resolve, reject) => {
          exec(`node "${dbCheckScript}"`, (error, stdout, stderr) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(stdout);
          });
        });
        
        if (result.includes('Kết nối thành công')) {
          console.log(`Kết nối database: ${chalk.green('Thành công')}`);
        } else {
          console.log(`Kết nối database: ${chalk.red('Thất bại')}`);
        }
      } catch (error) {
        console.log(`Kết nối database: ${chalk.red('Thất bại')} (${error.message})`);
      }
    } else {
      console.log(`Kiểm tra database: ${chalk.yellow('Không có script kiểm tra')}`);
    }
    
    // Hiển thị thông tin hệ thống
    console.log('\nThông tin hệ thống:');
    console.log(`Node.js: ${chalk.yellow(process.version)}`);
    console.log(`Hệ điều hành: ${chalk.yellow(process.platform)}`);
    console.log(`Bộ nhớ: ${chalk.yellow((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2))} MB / ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error(chalk.red(`Lỗi: ${error.message}`));
  }
}

/**
 * Chạy kiểm thử công cụ phát hiện đạo văn
 */
async function runPlagiarismTests() {
  console.log(chalk.cyan('=== CHẠY KIỂM THỬ CÔNG CỤ PHÁT HIỆN ĐẠO VĂN ==='));
  
  try {
    const testScript = path.join(__dirname, 'test-plagiarism-checker.js');
    
    if (fs.existsSync(testScript)) {
      // Chạy script kiểm thử
      const child = spawn('node', [testScript], {
        stdio: 'inherit'
      });
      
      // Đợi script hoàn thành
      await new Promise((resolve, reject) => {
        child.on('close', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Script kiểm thử thoát với mã lỗi ${code}`));
          }
        });
        
        child.on('error', reject);
      });
    } else {
      console.error(chalk.red(`Không tìm thấy script kiểm thử: ${testScript}`));
    }
  } catch (error) {
    console.error(chalk.red(`Lỗi: ${error.message}`));
  }
}

/**
 * Hàm chính
 */
async function main() {
  try {
    // Phân tích tham số dòng lệnh
    const { command, params } = parseArgs();
    
    // Xử lý các lệnh
    switch(command) {
      case 'check':
        await runPlagiarismCheck(params);
        break;
        
      case 'status':
        await checkThesisStatus(params);
        break;
        
      case 'stats':
        await showSystemStats();
        break;
        
      case 'test':
        await runPlagiarismTests();
        break;
        
      case 'help':
        displayHelp(params._[0]);
        break;
        
      default:
        if (command) {
          console.error(chalk.red(`Lệnh không hợp lệ: ${command}`));
        }
        
        displayHelp();
        break;
    }
  } catch (error) {
    console.error(chalk.red(`Lỗi: ${error.message}`));
    process.exit(1);
  }
}

// Chạy chương trình
main().catch(error => {
  console.error(chalk.red(`Lỗi chung: ${error.message}`));
  process.exit(1);
});
