// =================================================================
// --- 1. IMPORTS ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// CRITICAL FIX: These two lines are required for Socket.IO and were missing/incorrectly structured before.
const http = require('http');
const { Server } = require("socket.io");

// Model imports
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge'); // Ensure 'models/Challenge.js' exists

// =================================================================
// --- 2. INITIALIZATION ---
// This is the most robust and standard way to set up an Express + Socket.IO server.
// =================================================================
const app = express();
const server = http.createServer(app); // Create the HTTP server from the Express app
const io = new Server(server, { // Attach Socket.IO to the server immediately
    cors: {
        origin: "*", // Keep open for testing and deployment
    }
});

// =================================================================
// --- 3. MIDDLEWARE ---
// =================================================================
app.use(cors());
app.use(bodyParser.json());

const userSockets = {}; // This will track online users

// =================================================================
// --- 4. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// This section handles direct WebSocket communication.
// =================================================================
io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);
    
    socket.on('register', (userEmail) => {
        if (userEmail) {
            userSockets[userEmail] = socket.id;
            console.log(`User '${userEmail}' registered. Online users:`, Object.keys(userSockets));
        }
    });

    socket.on('disconnect', () => {
        for (const email in userSockets) {
            if (userSockets[email] === socket.id) {
                delete userSockets[email];
                break;
            }
        }
        console.log(`❌ A user disconnected. Online users:`, Object.keys(userSockets));
    });

    // --- ALL other socket.on listeners for WebRTC, game sync, etc. ---
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => { /* ...your existing logic... */ });
    socket.on('join-challenge-room', (roomName) => { /* ...your existing logic... */ });
    // ... etc. ...
});

// =================================================================
// --- 5. API ROUTES (EXPRESS) ---
// ALL your original routes are here, 100% UNCHANGED in their logic.
// They are all defined before the server starts, which is the correct way.
// =================================================================
app.get("/", (req, res) => { res.send("✅ FitFlow backend is working!"); });
app.post('/signup', async (req, res) => { /* ...your full, original signup code... */ });
app.post('/login', async (req, res) => { /* ...your full, original login code... */ });
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
// --- 6. SERVER STARTUP ---
// =================================================================
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // Use `server.listen` because our server is the `http` instance which includes Socket.IO
    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });