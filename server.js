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

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());


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

// ✅ SIMPLIFIED /send-challenge route
// This route now only saves to the database and attempts a push notification.
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
    
    // Attempt to send a PUSH notification if the user has a subscription
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

// --- ADD THIS NEW ROUTE ---

// GET the count of unread notifications for a user
app.get('/notifications/unread-count/:email', async (req, res) => {
    try {
        const userEmail = req.params.email;
        const count = await Notification.countDocuments({
            userEmail: userEmail,
            isRead: false 
        });
        res.status(200).json({ unreadCount: count });
    } catch (error) {
        console.error("❌ Error fetching unread count:", error);
        res.status(500).json({ error: 'Failed to fetch unread count.' });
    }
});

// --- Your existing /notifications/mark-read/:email route stays the same ---


// --- SERVER STARTUP (ROBUST STRUCTURE) ---
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // Use the standard app.listen(), as we no longer need the http server wrapper
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });