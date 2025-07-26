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

  // --- NEW: Heartbeat listener to keep connection alive ---
  socket.on('ping', () => {
    // This event listener's purpose is simply to receive a message.
    // The act of receiving data keeps the WebSocket connection from being terminated by hosting providers.
    // console.log(`Ping received from ${socket.id}`); // Optional: uncomment for verbose debugging
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


// --- ALL API ROUTES ARE DEFINED HERE ---

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
app.get('/user/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user) { return res.status(404).json({ message: "User not found." }); }
    res.json({ fullName: user.fullName, email: user.email, profileImage: user.profileImage || null });
  } catch (err) {
    console.error("❌ Error in /user/:email", err);
    res.status(500).json({ message: "Server error." });
  }
});

// ✅ Admin: get all users
app.get('/admin/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ✅ PUSH NOTIFICATION ROUTES
webpush.setVapidDetails(
  'mailto:your@email.com',
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

// ✅ HYBRID /send-challenge route
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

// ✅ API routes for the dynamic notification page
app.get('/notifications/:email', async (req, res) => {
    try {
        const notifications = await Notification.find({ userEmail: req.params.email }).sort({ timestamp: -1 });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});
app.post('/notifications/mark-read/:email', async (req, res) => {
    try {
        await Notification.updateMany({ userEmail: req.params.email, isRead: false }, { $set: { isRead: true } });
        res.json({ message: 'All notifications marked as read.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notifications as read.' });
    }
});


// --- SERVER STARTUP (ROBUST STRUCTURE) ---
const PORT = process.env.PORT || 5000;

// Step 1: Connect to the database
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // Step 2: Only after a successful DB connection, start the server.
    server.listen(PORT, () => {
      console.log(`🚀 Server with PUSH and IN-APP support running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    // If the database fails to connect, log the error and stop the application.
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });