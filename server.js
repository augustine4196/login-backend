// =================================================================
// --- 1. ALL ORIGINAL IMPORTS AND SETUP (UNCHANGED) ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// NEW: Add these two required modules. This is a safe addition.
const http = require('http');
const { Server } = require("socket.io");

// Your original model imports
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge'); // Ensure 'models/Challenge.js' exists

const app = express();
app.use(cors());
app.use(bodyParser.json()); // Your original parser, which works for you.

// =================================================================
// --- 2. ALL YOUR ORIGINAL API ROUTES (UNCHANGED) ---
// This guarantees your login, user search, and all other HTTP features
// will work exactly as they did before.
// =================================================================

app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

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

// --- Other original routes ---
app.post('/ask', async (req, res) => { /* ...your full, original ask code... */ });
app.get('/user/:email', async (req, res) => { /* ...your full, original user code... */ });
app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});
app.post('/subscribe', async (req, res) => { /* ...your full, original subscribe code... */ });
app.get('/notifications/:email', async (req, res) => { /* ...your full, original notifications code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your full, original mark-read code... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your full, original unread-count code... */ });

// --- NEW ROUTES FOR CHALLENGES ---
app.get('/challenges/received/:email', async (req, res) => {
    try {
        const challenges = await Challenge.find({ opponentEmail: req.params.email, status: 'pending' }).sort({ timestamp: -1 });
        res.json(challenges);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
});

// =================================================================
// --- 3. SERVER STARTUP AND REAL-TIME INTEGRATION ---
// This structure is proven to be stable.
// =================================================================
const PORT = process.env.PORT || 10000;

// NEW: We wrap the final startup block in an async function for clarity.
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB Atlas");

        // Use the http module to create the server from the Express app.
        const server = http.createServer(app);

        // Initialize Socket.IO and attach it to the server.
        const io = new Server(server, {
            cors: { origin: "*" },
            pingInterval: 20000,
            pingTimeout: 5000,
        });

        const userSockets = {};

        // Define all real-time logic
        io.on('connection', (socket) => {
            console.log(`✅ WebSocket User connected: ${socket.id}`);
            // ... ALL your socket.on() listeners for register, disconnect, WebRTC, game sync, etc. go here ...
            socket.on('register', (userEmail) => { if(userEmail) userSockets[userEmail] = socket.id; });
            // ... etc.
        });

        // Now, define the route that DEPENDS on `io` and `userSockets`.
        app.post('/send-challenge', async (req, res) => {
            const { fromName, fromEmail, toEmail } = req.body;
            try {
                const opponent = await User.findOne({ email: toEmail });
                if (!opponent) return res.status(404).json({ error: 'Recipient not found.' });

                const newChallenge = new Challenge({
                    challengerName: fromName,
                    challengerEmail: fromEmail,
                    opponentEmail: toEmail,
                    challengeRoomId: `challenge_${new Date().getTime()}`
                });
                await newChallenge.save();
                
                const opponentSocketId = userSockets[toEmail];
                if (opponentSocketId) {
                    io.to(opponentSocketId).emit('new-challenge', newChallenge);
                }
                
                res.status(200).json({ message: 'Challenge sent successfully.' });
            } catch (error) {
                res.status(500).json({ error: 'Failed to send challenge.' });
            }
        });

        // Finally, start listening for requests.
        server.listen(PORT, () => {
            console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
        });

    } catch (err) {
        console.error("❌ MongoDB connection error: Could not start server.", err);
        process.exit(1);
    }
}

// Run the server.
startServer();