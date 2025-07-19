const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: String,
  email: String,
  password: String,
  gender: String,
  age: String,
  height: String,
  weight: String,
  place: String,
  equipments: [String],  // ✅ This allows an array of strings
  goal: String
});

module.exports = mongoose.model('User', userSchema);
