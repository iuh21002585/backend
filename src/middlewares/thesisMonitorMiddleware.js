/**
 * Middleware giám sát xử lý luận văn
 * 
 * File này cung cấp một middleware Express để giám sát và quản lý quá trình xử lý luận văn
 * thông qua các API endpoints. Việc xử lý tự động được thực hiện bởi autoProcessor.js
 */

const mongoose = require('mongoose');
const Thesis = require('../models/Thesis');
const User = require('../models/User');
const thesisProcessor = require('../services/thesisProcessor');

// Import autoProcessor nếu cần
let autoProcessor;
try {
  autoProcessor = require('../services/autoProcessor');
} catch (error) {
  console.error('Không thể tải autoProcessor:', error);
}

/**
 * Middleware để thiết lập API giám sát quá trình xử lý luận văn
 */
function setupThesisProcessingMonitor(app) {
  console.log('[ThesisMonitor] Thiết lập hệ thống giám sát xử lý luận văn');
  
  // Không cần lên lịch kiểm tra định kỳ nữa vì autoProcessor đã làm điều đó
  // API endpoints để giám sát và quản lý
  
  // Endpoint để kiểm tra trạng thái
  app.get('/api/system-status', (req, res) => {
    const processorStatus = thesisProcessor.getStatus();
    
    // Lấy thông tin từ autoProcessor nếu có
    let autoProcessorStatus = { running: false };
    if (autoProcessor && typeof autoProcessor.getAutoProcessorStatus === 'function') {
      autoProcessorStatus = autoProcessor.getAutoProcessorStatus();
    }
    
    res.json({
      system: 'ThesisProcessor',
      status: 'running',
      processing: {
        current: processorStatus.currentProcessingCount,
        max: processorStatus.maxConcurrent,
        thesisIds: processorStatus.processingTheses
      },
      queue: {
        length: processorStatus.queueLength
      },
      autoProcessor: {
        running: autoProcessorStatus.running
      },
      timestamp: new Date()
    });
  });
  
  // Endpoint để kiểm tra danh sách luận văn đang chờ
  app.get('/api/pending-theses', async (req, res) => {
    try {
      const pendingTheses = await Thesis.find({ status: 'pending' })
        .select('_id title userId fileUrl uploadedAt')
        .limit(10)
        .sort({ uploadedAt: 1 });
      
      res.json({
        count: pendingTheses.length,
        theses: pendingTheses
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Endpoint để khởi động xử lý một luận văn cụ thể
  app.post('/api/process-thesis/:id', async (req, res) => {
    try {
      const thesisId = req.params.id;
      const thesis = await Thesis.findById(thesisId);
      
      if (!thesis) {
        return res.status(404).json({ message: 'Không tìm thấy luận văn' });
      }
      
      // Lấy thông tin người dùng
      const user = await User.findById(thesis.userId);
      
      if (!user) {
        return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      }
      
      // Đưa luận văn vào xử lý
      thesisProcessor.submitThesis(thesisId, {
        userId: thesis.userId,
        userEmail: user.email
      });
      
      res.json({
        message: 'Đã đưa luận văn vào xử lý',
        status: thesisProcessor.getStatus()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Endpoint để bật/tắt hệ thống xử lý tự động
  app.post('/api/auto-processor/:action', (req, res) => {
    try {
      const action = req.params.action;
      
      if (!autoProcessor) {
        return res.status(404).json({ 
          success: false,
          message: 'Hệ thống xử lý tự động không khả dụng'
        });
      }
      
      if (action === 'start') {
        if (typeof autoProcessor.startAutomaticProcessing === 'function') {
          const result = autoProcessor.startAutomaticProcessing();
          return res.json(result);
        }
      } else if (action === 'stop') {
        if (typeof autoProcessor.stopAutomaticProcessing === 'function') {
          const result = autoProcessor.stopAutomaticProcessing();
          return res.json(result);
        }
      } else {
        return res.status(400).json({ 
          success: false,
          message: 'Hành động không hợp lệ. Sử dụng "start" hoặc "stop"'
        });
      }
      
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hàm xử lý cho hành động này'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  console.log('[ThesisMonitor] Đã khởi động hệ thống giám sát xử lý luận văn');
}

module.exports = { setupThesisProcessingMonitor };
