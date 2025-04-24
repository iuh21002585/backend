const Config = require('../models/configModel');
const asyncHandler = require('express-async-handler');

// @desc    Lấy tất cả cấu hình
// @route   GET /api/config
// @access  Private/Admin
const getAllConfigs = asyncHandler(async (req, res) => {
  const configs = await Config.find({});
  res.json(configs);
});

// @desc    Lấy cấu hình theo key
// @route   GET /api/config/:key
// @access  Private/Admin
const getConfigByKey = asyncHandler(async (req, res) => {
  const config = await Config.findOne({ key: req.params.key });
  
  if (config) {
    res.json(config);
  } else {
    res.status(404);
    throw new Error('Không tìm thấy cấu hình');
  }
});

// @desc    Cập nhật hoặc tạo cấu hình
// @route   PUT /api/config/:key
// @access  Private/Admin
const updateConfig = asyncHandler(async (req, res) => {
  const { value, description } = req.body;
  
  if (value === undefined) {
    res.status(400);
    throw new Error('Vui lòng cung cấp giá trị cho cấu hình');
  }
  
  const config = await Config.findOne({ key: req.params.key });
  
  if (config) {
    config.value = value;
    if (description) config.description = description;
    
    const updatedConfig = await config.save();
    res.json(updatedConfig);
  } else {
    const newConfig = await Config.create({
      key: req.params.key,
      value,
      description: description || `Cấu hình cho ${req.params.key}`
    });
    
    res.status(201).json(newConfig);
  }
});

// @desc    Xóa cấu hình
// @route   DELETE /api/config/:key
// @access  Private/Admin
const deleteConfig = asyncHandler(async (req, res) => {
  const config = await Config.findOne({ key: req.params.key });
  
  if (config) {
    await config.deleteOne();
    res.json({ message: 'Đã xóa cấu hình' });
  } else {
    res.status(404);
    throw new Error('Không tìm thấy cấu hình');
  }
});

// @desc    Khởi tạo cấu hình mặc định
// @route   POST /api/config/init
// @access  Private/Admin
const initDefaultConfigs = asyncHandler(async (req, res) => {
  // Danh sách các cấu hình mặc định
  const defaultConfigs = [
    {
      key: 'maxPlagiarismPercentage',
      value: 30,
      description: 'Ngưỡng phần trăm đạo văn tối đa cho phép'
    }
  ];
  
  // Kiểm tra và tạo nếu chưa tồn tại
  for (const config of defaultConfigs) {
    const existingConfig = await Config.findOne({ key: config.key });
    if (!existingConfig) {
      await Config.create(config);
    }
  }
  
  res.status(201).json({ message: 'Đã khởi tạo cấu hình mặc định' });
});

module.exports = {
  getAllConfigs,
  getConfigByKey,
  updateConfig,
  deleteConfig,
  initDefaultConfigs
};
