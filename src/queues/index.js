const { getRedisConfig } = require('../config/redis');

const Queue = require('bull');
const redisConf = getRedisConfig();


const thesisQueue = new Queue('thesis-proccessing', redisConf);

const notificationQueue = new Queue('notifications', redisConf);


thesisQueue.on('ready', () => {
  console.log('[thesisQueue] Connected to Redis successfully');
});

notificationQueue.on('ready', () => {
  console.log('[notificationQueue] Connected to Redis successfully');
});

// // Xử lý khi kết nối Redis bị mất
// thesisQueue.on('error', (error) => {
//   console.error('[Queue] Redis connection error:', error);
// });

// notificationQueue.on('error', (error) => {
//   console.error('[Queue] Redis connection error:', error);
// });


module.exports = {
  thesisQueue,
  notificationQueue
};
