const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // --- Core Account Information ---
  fullName: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    unique: true, 
    required: true,
    lowercase: true, // Always store email in lowercase for consistency
    trim: true       // Remove any whitespace
  },
  password: { 
    type: String, 
    required: true 
  },
  profileImage: { 
    type: String, 
    default: 'profile.png' // Default placeholder image, will be updated with Base64 data
  },

  // --- Initial Onboarding & Physical Stats ---
  gender: { 
    type: String 
  },
  age: { 
    type: Number // Changed from String for proper numerical operations
  },
  height: { 
    type: Number, // Changed from String (in cm)
    default: 0 
  },
  weight: { 
    type: Number, // Changed from String (in kg)
    default: 0 
  },
  bmi: { 
    type: Number 
  },
  place: { 
    type: String 
  },
  equipments: { 
    type: [String] 
  },
  goal: { 
    type: String // The general goal from the initial setup
  },
  
  // --- NEW FIELDS from the Profile Edit Page ---
  bio: {
    type: String,
    default: '' // A short user biography
  },
  primaryGoal: {
    type: String,
    default: 'loss' // Specific goal (e.g., 'loss', 'gain')
  },
  weeklyGoal: {
    type: String,
    default: '3-4' // Workout frequency (e.g., '3-4 times a week')
  },
  targetWeight: {
    type: Number // User's target weight in kg
  },

  // --- Other Fields ---
  subscription: { 
    type: Object 
  }

}, { 
  timestamps: true // Automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('User', UserSchema);