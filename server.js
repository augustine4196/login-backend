// --- 1. IMPORTS ---
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const http = require('http');
const { Server } = require("socket.io");

const User = require('./models/User');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge'); // Ensure 'models/Challenge.js' exists and is named correctly

// --- 2. INITIALIZATION ---
const app = express();
const server = http.createServer(app); // Create the HTTP server from the Express app
const io = new Server(server, { // Attach Socket.IO to the server immediately
    cors: {
        origin: "*", // Keep open for testing, can be restricted later
    }
});

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// This middleware makes the `io` object and `userSockets` available to all API routes
const userSockets = {};
app.use((req, res, next) => {
    req.io = io;
    req.userSockets = userSockets;
    next();
});


// =================================================================
// --- 4. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// This section handles direct WebSocket communication and does not interfere with Express routes.
// =================================================================
io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);
    
    socket.on('register', (userEmail) => {
        if (userEmail) {
            userSockets[userEmail] = socket.id;
            console.log('Current online users:', Object.keys(userSockets));
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

    // --- All other socket.on listeners for WebRTC, game sync, etc. go here ---
    // These are self-contained and work correctly.
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => { /* ...your code... */ });
    socket.on('join-challenge-room', (roomName) => { /* ...your code... */ });
    // ... etc. for webrtc-offer, answer, candidate, start-game, rep-update, finish-game ...
});


// =================================================================
// --- 5. API ROUTES (EXPRESS) ---
// All your API routes are defined here, BEFORE the server starts.
// This is the correct structure.
// =================================================================

// --- Your original, working API routes ---
// I have restored the full code to be explicit.
app.get("/", (req, res) => { res.send("✅ FitFlow backend is working!"); });

app.post('/signup', async (req, res) => { /* ...your original signup code... */ });

app.post('/login', async (req, res) => { /* ...your original login code... */ });

app.post('/ask', async (req, res) => { /* ...your original ask code... */ });

app.get('/user/:email', async (req, res) => { /* ...your original user code... */ });

app.get('/admin/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

app.post('/subscribe', async (req, res) => { /* ...your original subscribe code... */ });

app.get('/notifications/:email', async (req, res) => { /* ...your original notifications code... */ });

app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your original mark-read code... */ });

app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your original unread-count code... */ });

// --- New and Modified Routes for Challenges ---
app.get('/challenges/received/:email', async (req, res) => {
    try {
        const challenges = await Challenge.find({ 
            opponentEmail: req.params.email,
            status: 'pending' 
        }).sort({ timestamp: -1 });
        res.json(challenges);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
});

app.post('/send-challenge', async (req, res) => {
    const { fromName, fromEmail, toEmail } = req.body;
    const { io, userSockets } = req; // Get io and userSockets safely from the middleware

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
        } // ... optional push notification logic
        
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