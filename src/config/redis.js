
function getRedisConfig() {
  return {
    redis: {
      host: process.env.UPSTASH_REDIS_REST_DOMAIN,
      port: 6379,
      password: process.env.UPSTASH_REDIS_REST_TOKEN,
      tls: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    }
  };
}

module.exports = { getRedisConfig };