/**
 * Module này cung cấp một triển khai giả của hệ thống hàng đợi
 * để thay thế cho Redis và Bull
 * 
 * Các đối tượng queue có API tương thích với Bull để không phải sửa nhiều code
 * 
 * LƯU Ý: Đây không phải là một hệ thống hàng đợi thực sự mà chỉ là một adapter
 * để tương thích với code cũ. Chức năng thực tế được xử lý bởi thesisMonitorMiddleware
 */

const EventEmitter = require('events');

class QueueAdapter extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    console.log(`[QueueAdapter] Khởi tạo adapter cho queue ${name}`);
    
    // Giả lập sự kiện ready
    setTimeout(() => {
      this.emit('ready');
    }, 0);
  }
  
  // Phương thức add có thể chuyển tiếp yêu cầu đến thesisProcessor hoặc notifyService
  async add(data, options = {}) {
    console.log(`[QueueAdapter:${this.name}] Yêu cầu thêm vào hàng đợi:`, data);
    
    // Ghi lại yêu cầu và trả về một promise đã resolve
    if (this.name === 'thesis-proccessing') {
      // Nếu có thể, chuyển tiếp yêu cầu đến thesisProcessor
      try {
        const thesisProcessor = require('../services/thesisProcessor');
        await thesisProcessor.scheduleProcessing(data.thesisId);
        console.log(`[QueueAdapter] Đã chuyển tiếp yêu cầu xử lý luận văn ${data.thesisId} đến thesisProcessor`);
      } catch (error) {
        console.error(`[QueueAdapter] Lỗi khi chuyển tiếp yêu cầu:`, error);
      }
    } else if (this.name === 'notifications') {
      // Nếu là thông báo, có thể xử lý trực tiếp hoặc ghi log
      try {
        const notifyService = require('../services/notificationService');
        await notifyService.sendNotification(data);
        console.log(`[QueueAdapter] Đã chuyển tiếp yêu cầu thông báo đến notificationService`);
      } catch (error) {
        console.error(`[QueueAdapter] Không thể gửi thông báo:`, error);
      }
    }
    
    return { id: Date.now() }; // Trả về ID giả
  }
    // Các phương thức khác để giả lập tương thích với Bull
  getJobCounts() {
    return Promise.resolve({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    });
  }
  
  // Phương thức giả lập lấy công việc theo ID
  async getJob(jobId) {
    console.log(`[QueueAdapter] getJob được gọi với ID ${jobId}, trả về null`);
    return null;
  }
  
  // Phương thức giả lập lấy danh sách công việc đang chờ
  async getWaiting() {
    console.log(`[QueueAdapter] getWaiting được gọi, trả về mảng rỗng`);
    return [];
  }
  
  // Phương thức giả lập lấy danh sách công việc lỗi
  async getFailed() {
    console.log(`[QueueAdapter] getFailed được gọi, trả về mảng rỗng`);
    return [];
  }
  
  // Phương thức giả để đóng kết nối - không cần làm gì
  async close() {
    console.log(`[QueueAdapter] close được gọi`);
    return Promise.resolve();
  }
  
  // Phương thức giả để xử lý công việc - chỉ để tương thích với mã cũ
  process(concurrency, handler) {
    console.log(`[QueueAdapter] process được gọi với concurrency=${concurrency}`);
    // Không cần thực hiện gì - thesisMonitorMiddleware sẽ xử lý
    return this;
  }
}

const thesisQueue = new QueueAdapter('thesis-proccessing');
const notificationQueue = new QueueAdapter('notifications');

module.exports = {
  thesisQueue,
  notificationQueue
};
