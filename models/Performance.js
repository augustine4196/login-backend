const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  count: {
    type: Number,
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in seconds
    required: true
  },
  estimatedCaloriesBurned: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Performance', performanceSchema);