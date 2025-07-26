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
  });
});

// --- YOUR ORIGINAL API ROUTES (Copied Exactly) ---

// ✅ Root test route
app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

// ✅ Signup route
app.post('/signup', async (req, res) => {
  const { fullName, email, password, gender, age, height, weight, place, equipments, goal, profileImage } = req.body;
  try {
    const sanitizedEmail = email.toLowerCase().trim();
    if (!fullName || !sanitizedEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    const existingUser = await User.findOne({ email: sanitizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }
    const newUser = new User({ fullName, email: sanitizedEmail, password, gender, age, height, weight, place, equipments, goal, profileImage });
    await newUser.save();
    res.status(201).json({ message: "Account created successfully!" });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

// ✅ Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "User not found." });
    if (String(user.password) !== String(password)) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    res.status(200).json({
      message: "Login successful!",
      fullName: user.fullName,
      email: user.email,
      profileImage: user.profileImage || null
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ✅ GET user by email (used in search bar)
app.get('/user/:email', async (req, res) => { /* ...your existing code... */ });
app.post('/ask', async (req, res) => { /* ...your existing chatbot code... */ });
app.post("/profile", async (req, res) => { /* ...your existing profile code... */ });
app.post('/upload-profile-image', async (req, res) => { /* ...your existing image upload code... */ });
app.get('/admin/users', async (req, res) => { /* ...your existing admin users code... */ });

// --- PUSH NOTIFICATION ROUTES (Unchanged) ---
webpush.setVapidDetails(
  'mailto:your@email.com',
  'BJgQO8CvRLdcGr5LFA9qisfTLG8FwdvMLOFPaqX4rGi4bGSmOL-0RHKaWkuQg5GEyMDCfhEOuDxr2z1PwPg_2zM',
  'WbSlhUVA7xQImHjp00hxSA14t0V7l0cl7p7hCqPOpMA'
);

app.post('/subscribe', async (req, res) => { /* ...your existing subscribe code... */ });

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
      const payload = JSON.stringify({ title: 'New Challenge Received', message: `${fromName} has challenged you on FitFlow! 💪` });
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