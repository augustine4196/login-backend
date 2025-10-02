const mongoose = require('mongoose');

const exerciseSessionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true // Indexing email for faster queries
  },
  exerciseName: {
    type: String,
    required: true,
    trim: true,
    default: 'Push-up' // Default since this page is for push-ups
  },
  reps: {
    type: Number,
    required: true,
    min: 0
  },
  durationSeconds: {
    type: Number,
    required: true,
    min: 0
  },
  caloriesBurned: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    default: Date.now // Automatically sets the date when a session is saved
  }
});

const ExerciseSession = mongoose.model('ExerciseSession', exerciseSessionSchema);

module.exports = ExerciseSession;