const jwt = require('jsonwebtoken');

// Tạo JWT token để xác thực người dùng
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

module.exports = generateToken;
