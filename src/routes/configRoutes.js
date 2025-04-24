const express = require('express');
const router = express.Router();
const {
  getAllConfigs,
  getConfigByKey,
  updateConfig,
  deleteConfig,
  initDefaultConfigs
} = require('../controllers/configController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Tất cả các routes đều yêu cầu quyền admin
router.use(protect, admin);

router.route('/')
  .get(getAllConfigs);

router.route('/init')
  .post(initDefaultConfigs);

router.route('/:key')
  .get(getConfigByKey)
  .put(updateConfig)
  .delete(deleteConfig);

module.exports = router;
