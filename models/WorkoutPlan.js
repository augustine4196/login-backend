const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  reps: {
    type: String, // e.g., "20 reps", "12 reps × 3 sets"
    required: true
  },
  duration: {
    type: String, // e.g., "7 min" for time-based exercises
    default: null
  },
  notes: {
    type: String, // Additional instructions or weight recommendations
    default: ""
  }
});

const dayPlanSchema = new mongoose.Schema({
  day: {
    type: String,
    required: true,
    enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  },
  exercises: {
    type: [exerciseSchema],
    validate: [arrayLimit, '{PATH} must contain exactly 8 exercises']
  }
});

function arrayLimit(val) {
  return val.length === 8;
}

const workoutPlanSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  bmi: {
    type: Number,
    required: true
  },
  bmiCategory: {
    type: String,
    required: true,
    enum: ['Underweight', 'Normal weight', 'Overweight', 'Obese']
  },
  goal: {
    type: String,
    required: true,
    enum: ['Get Fit', 'Lose Weight', 'Gain Weight', 'Body Building']
  },
  weeklyPlan: {
    type: [dayPlanSchema],
    validate: [arrayLimit7, '{PATH} must contain exactly 7 days']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

function arrayLimit7(val) {
  return val.length === 7;
}

// Pre-save middleware to update lastUpdated
workoutPlanSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

module.exports = mongoose.model('WorkoutPlan', workoutPlanSchema);