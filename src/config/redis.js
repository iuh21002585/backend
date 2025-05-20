
/**
 * Tệp này được giữ lại cho mục đích tương thích với mã cũ
 * Hệ thống không còn sử dụng Redis nên cấu hình này không còn được sử dụng
 * 
 * Hãy sử dụng thesisMonitorMiddleware để giám sát và quản lý xử lý luận văn thay thế
 */

function getRedisConfig() {
  console.log('[Redis Config] Cảnh báo: Redis không còn được sử dụng. Đang sử dụng cấu hình giả.');
  return {
    // Trả về một đối tượng trống để tránh lỗi cho mã cũ
    redis: {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      retryStrategy: () => null // Không thử lại kết nối
    }
  };
}

module.exports = { getRedisConfig };