const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  gender: {
    type: String
  },
  age: {
    type: String
  },
  height: {
    type: String // in cm
  },
  weight: {
    type: String // in kg
  },
  place: {
    type: String
  },
  equipments: {
    type: [String]
  },
  goal: {
    type: String
  },
  profileImage: {
    type: String
  },
  bmi: {
    type: Number
  },

  // --- THIS IS THE KEY ADDITION FOR SUBSCRIPTIONS ---
  isPremium: {
    type: Boolean,
    default: false // Users are not premium by default
  }

}, {
  // This option automatically adds createdAt and updatedAt fields
  timestamps: true
});

const User = mongoose.model('User', userSchema);

module.exports = User;