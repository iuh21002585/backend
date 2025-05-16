/**
 * Ước tính thời gian hoàn thành kiểm tra đạo văn
 * @param {number} fileSize - Kích thước file (KB)
 * @param {Object} options - Các tùy chọn kiểm tra
 * @returns {Object} - Thời gian ước tính
 */
function estimatePlagiarismCheckTime(fileSize, options = {}) {
  // Các tham số cơ bản
  const BASE_TIME = 30; // seconds
  const SIZE_FACTOR = 0.005; // seconds per KB
  
  // Tính toán dựa trên kích thước file
  const sizeTime = fileSize * SIZE_FACTOR;
  
  // Điều chỉnh theo loại kiểm tra
  let totalTime = BASE_TIME + sizeTime;
  
  if (options.checkTraditionalPlagiarism) {
    totalTime *= 1.5;
  }
  
  if (options.checkAiPlagiarism) {
    totalTime *= 1.8;
  }
  
  // Thêm thời gian đệm (30%)
  totalTime *= 1.3;
  
  // Chuyển đổi sang phút và làm tròn lên
  const estimatedMinutes = Math.ceil(totalTime / 60);
  
  // Giới hạn thời gian tối thiểu là 2 phút
  const finalMinutes = Math.max(2, estimatedMinutes);
  
  return {
    minutes: finalMinutes,
    formatted: `khoảng ${finalMinutes} phút`
  };
}

module.exports = { estimatePlagiarismCheckTime };
