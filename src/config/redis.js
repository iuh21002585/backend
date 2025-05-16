/**
 * Cấu hình Redis cho IUH_PLAGCHECK
 * File này quản lý các cấu hình liên quan đến kết nối Redis
 */

// Thiết lập URL mặc định từ biến môi trường
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Kiểm tra biến môi trường Redis
if (!process.env.REDIS_URL) {
  console.warn('REDIS_URL không được định nghĩa trong biến môi trường. Đang sử dụng URL mặc định: redis://localhost:6379');
}

// Cấu hình cho Redis với TLS (nếu cần)
const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      // Thử lại kết nối với backoff time tăng dần
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  }
};

/**
 * Trả về cấu hình Redis cho các kết nối
 * @returns {Object} Cấu hình Redis
 */
function getRedisConfig() {
  return {
    url: REDIS_URL,
    options: process.env.REDIS_URL ? {} : redisConfig
  };
}

module.exports = { getRedisConfig, REDIS_URL, redisConfig };