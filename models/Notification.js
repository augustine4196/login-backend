const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // The email of the user who should receive the notification
  userEmail: { type: String, required: true, index: true }, 
  
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  
  // Automatically add a timestamp when the notification is created
  timestamp: { type: Date, default: Date.now } 
});

module.exports = mongoose.model('Notification', notificationSchema);