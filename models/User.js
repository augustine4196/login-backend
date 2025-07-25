const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String },
  email: { type: String, unique: true, required: true },
  password: { type: String },
  gender: { type: String },
  age: { type: String },
  height: { type: String },
  weight: { type: String },
  place: { type: String },
  equipments: { type: [String] },
  goal: { type: String },
  profileImage: { type: String },
  
  // This field will store the unique push notification subscription object for each user.
  subscription: { type: Object } 
});

module.exports = mongoose.model('User', userSchema);