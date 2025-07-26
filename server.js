const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// --- MODEL IMPORTS ---
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification'); // For notification history

const app = express();

// --- HTTP and Socket.IO Setup ---
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- REAL-TIME LOGIC for In-App Notifications ---
let onlineUsers = {};

io.on('connection', (socket) => {
  console.log('✅ User connected for real-time events:', socket.id);
  socket.on('user_online', (userEmail) => {
    if (userEmail) {
      onlineUsers[userEmail] = socket.id;
      console.log('Online users:', onlineUsers);
    }
  });
  socket.on('disconnect', () => {
    for (const email in onlineUsers) {
      if (onlineUsers[email] === socket.id) {
        delete onlineUsers[email];
        console.log(`User ${email} disconnected.`);
        break;
      }
    }
    console.log('Online users:', onlineUsers);
  });
});

// --- YOUR EXISTING API ROUTES ---
app.get("/", (req, res) => { res.send("✅ FitFlow backend is working!"); });
app.post('/signup', async (req, res) => { /* ...your existing signup code... */ });
app.post('/login', async (req, res) => { /* ...your existing login code... */ });
app.get('/user/:email', async (req, res) => { /* ...your existing user search code... */ });
app.post('/ask', async (req, res) => { /* ...your existing chatbot code... */ });
app.post("/profile", async (req, res) => { /* ...your existing profile code... */ });
app.post('/upload-profile-image', async (req, res) => { /* ...your existing image upload code... */ });
app.get('/admin/users', async (req, res) => { /* ...your existing admin users code... */ });

// --- PUSH NOTIFICATION ROUTES (Corrected) ---
// ✅ THIS IS THE FIXED SECTION
webpush.setVapidDetails(
  'mailto:your@email.com', // Replace with your actual email
  'BJgQO8CvRLdcGr5LFA9qisfTLG8FwdvMLOFPaqX4rGi4bGSmOL-0RHKaWkuQg5GEyMDCfhEOuDxr2z1PwPg_2zM',
  'WbSlhUVA7xQImHjp00hxSA14t0V7l0cl7p7hCqPOpMA'
);

app.post('/subscribe', async (req, res) => {
  const { email, subscription } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.subscription = subscription;
    await user.save();
    res.status(201).json({ message: 'Subscription saved successfully.' });
  } catch (err) {
    console.error("❌ Error saving subscription:", err);
    res.status(500).json({ error: 'Failed to save subscription.' });
  }
});
// ✅ END OF FIXED SECTION

// --- MODIFIED: /send-challenge route for HYBRID notifications ---
app.post('/send-challenge', async (req, res) => {
  const { fromName, toEmail } = req.body;
  try {
    const recipient = await User.findOne({ email: toEmail });
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found.' });
    }
    const newNotification = new Notification({
        userEmail: toEmail,
        title: `New Challenge from ${fromName}! 🤺`,
        message: `You have been challenged to a friendly competition.`
    });
    await newNotification.save();
    console.log("✅ Notification saved to DB.");
    const recipientSocketId = onlineUsers[toEmail];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receive_challenge', newNotification);
      console.log("✅ Sent IN-APP notification.");
    }
    if (recipient.subscription) {
      const payload = JSON.stringify({
        title: 'New Challenge Received',
        message: `${fromName} has challenged you on FitFlow! 💪`
      });
      await webpush.sendNotification(recipient.subscription, payload);
      console.log("✅ Sent PUSH notification.");
    }
    res.status(200).json({ message: 'Challenge sent successfully.' });
  } catch (error) {
    console.error('❌ Error in /send-challenge:', error);
    res.status(500).json({ error: 'Failed to send challenge.' });
  }
});

// --- NEW: API routes for the dynamic notification page ---
app.get('/notifications/:email', async (req, res) => { /* ...your notifications code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your mark-read code... */ });

// --- FINAL SERVER STARTUP ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server with PUSH and IN-APP support running at http://localhost:${PORT}`);
});