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
  equipments: [String],
  goal: String,
  profileImage: String,
  subscription: Object // 👈 Add this line to store push subscription
});

module.exports = mongoose.model('User', userSchema);
