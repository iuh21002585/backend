const Bull = require('bull');
const { getRedisConfig, REDIS_URL } = require('../config/redis');

// Lấy cấu hình Redis
const redisConf = getRedisConfig();

// Khởi tạo các queues
const thesisQueue = new Bull('thesis-processing', REDIS_URL, redisConf.options);

const notificationQueue = new Bull('notifications', REDIS_URL, redisConf.options);

// Xử lý khi kết nối Redis bị mất
thesisQueue.on('error', (error) => {
  console.error('[Queue] Redis connection error:', error);
});

notificationQueue.on('error', (error) => {
  console.error('[Queue] Redis connection error:', error);
});

module.exports = {
  thesisQueue,
  notificationQueue
};
