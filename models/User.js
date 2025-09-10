const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String },
  email: { type: String, unique: true, required: true },
  password: { type: String },
  gender: { type: String },
  age: { type: String },
  height: { type: String },   // in cm
  weight: { type: String },   // in kg
  place: { type: String },
  equipments: { type: [String] },
  goal: { type: String },
  profileImage: { type: String },
  subscription: { type: Object },

  bmi: { type: Number }   // <-- Add this field
});

module.exports = mongoose.model('User', userSchema);
