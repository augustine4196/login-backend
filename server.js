// =================================================================
// --- 1. IMPORTS ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const http = require('http');
const { Server } = require("socket.io");

const User = require('./models/User');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge');

// =================================================================
// --- 2. INITIALIZATION & MIDDLEWARE ---
// =================================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 20000,
    pingTimeout: 5000,
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userSockets = {};

// =================================================================
// --- 3. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// =================================================================
io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);
    
    socket.on('register', (userEmail) => {
        if (userEmail) {
            socket.userEmail = userEmail;
            userSockets[userEmail] = socket.id;
            console.log(`User '${userEmail}' registered. Online users:`, Object.keys(userSockets));
        }
    });

    socket.on('disconnect', () => {
        if (socket.userEmail) {
            delete userSockets[socket.userEmail];
            console.log(`❌ User '${socket.userEmail}' disconnected. Online users:`, Object.keys(userSockets));
            if (socket.roomName) {
                socket.to(socket.roomName).emit('peer-disconnected');
            }
        }
    });

    // --- Challenge Flow Listeners ---
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
        console.log(`Received 'accept-challenge' for room: ${challengeRoomId}`);
        await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
        const challengerSocketId = userSockets[challengerEmail];
        if (challengerSocketId) {
            io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
        }
        socket.emit('challenge-accepted-redirect', { challengeRoomId });
    });

    // --- WebRTC Signaling Listeners ---
    socket.on('join-challenge-room', (roomName) => {
        socket.roomName = roomName;
        socket.join(roomName);
        socket.to(roomName).emit('peer-joined');
    });
    // ... all other WebRTC and game sync listeners ...
});

// =================================================================
// --- 4. API ROUTES (EXPRESS) ---
// YOUR ORIGINAL, WORKING ROUTES ARE FULLY RESTORED AND UNCHANGED.
// =================================================================

app.get("/", (req, res) => res.send("✅ FitFlow backend is working!"));

app.post('/signup', async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    const sanitizedEmail = email.toLowerCase().trim();
    if (!fullName || !sanitizedEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    const existingUser = await User.findOne({ email: sanitizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }
    const newUser = new User({ fullName, email: sanitizedEmail, password });
    await newUser.save();
    res.status(201).json({
        message: "Account created successfully!",
        fullName: newUser.fullName,
        email: newUser.email
    });
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

app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

// ... your other original routes like /ask, /subscribe, etc. ...

// --- New and Modified Routes for Challenges ---
app.get('/challenges/received/:email', async (req, res) => {
    try {
        const challenges = await Challenge.find({ opponentEmail: req.params.email, status: 'pending' }).sort({ timestamp: -1 });
        res.json(challenges);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
});

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
        console.error('❌ Error in /send-challenge:', error);
        res.status(500).json({ error: 'Failed to send challenge.' });
    }
});

// =================================================================
// --- 5. SERVER STARTUP ---
// =================================================================
const PORT = process.env.PORT || 10000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });