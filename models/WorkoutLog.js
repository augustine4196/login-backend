const mongoose = require('mongoose');

const WorkoutLogSchema = new mongoose.Schema({
  email: { type: String, required: true },   // which user
  exerciseName: { type: String, required: true },
  reps: { type: Number, default: 0 },
  duration: { type: Number, default: 0 }, // minutes
  calories: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WorkoutLog', WorkoutLogSchema);
