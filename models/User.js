const mongoose = require('mongoose');

// This schema correctly defines the structure of your user document in MongoDB.
// The `profileImage: String` line ensures that the image URL can be saved.
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
  profileImage: String 
});

module.exports = mongoose.model('User', userSchema);