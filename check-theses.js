const mongoose = require('mongoose');
const Thesis = require('./src/models/Thesis');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to MongoDB');
  const theses = await Thesis.find().sort({uploadedAt: -1}).limit(5).select('_id title status uploadedAt');
  console.log('Recent theses:', JSON.stringify(theses, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
