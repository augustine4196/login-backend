// --- 1. IMPORTS ---
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// NEW: Required modules for the correct server structure
const http = require('http');
const { Server } = require("socket.io");

// Model imports
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge');

// --- 2. INITIALIZATION ---
const app = express();
const server = http.createServer(app); // Create the HTTP server
const io = new Server(server, { // Attach Socket.IO to the server INSTANTLY
    cors: {
        origin: "*", // Keep open for testing
    }
});

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// NEW: This middleware makes the `io` object and `userSockets` available to all API routes
const userSockets = {};
app.use((req, res, next) => {
    req.io = io;
    req.userSockets = userSockets;
    next();
});

// =================================================================
// --- 4. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// This section handles direct WebSocket communication.
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

    // All your other socket.on listeners for WebRTC, game sync, etc., go here.
    // They are self-contained and do not affect the HTTP server.
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => { /* ...your code... */ });
    socket.on('join-challenge-room', (roomName) => { /* ...your code... */ });
    // ... etc ...
});

// =================================================================
// --- 5. API ROUTES (EXPRESS) ---
// All your original routes are here, 100% UNCHANGED.
// =================================================================

app.get("/", (req, res) => { /* ...your original code... */ });
app.post('/signup', async (req, res) => { /* ...your original code... */ });
app.post('/login', async (req, res) => { /* ...your original code... */ });
app.post('/ask', async (req, res) => { /* ...your original code... */ });
app.get('/user/:email', async (req, res) => { /* ...your original code... */ });
app.get('/admin/users', async (req, res) => { /* ...your original code... */ });
app.post('/subscribe', async (req, res) => { /* ...your original code... */ });
app.get('/notifications/:email', async (req, res) => { /* ...your original code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your original code... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your original code... */ });

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

// The /send-challenge route now correctly uses `req.io` from the middleware
app.post('/send-challenge', async (req, res) => {
    const { fromName, fromEmail, toEmail } = req.body;
    const { io, userSockets } = req; // Get io and userSockets from the request object

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
        console.log(`Attempting to send real-time event to '${toEmail}'. Found socket ID: ${opponentSocketId || 'Not Online'}`);
        if (opponentSocketId) {
            io.to(opponentSocketId).emit('new-challenge', newChallenge);
        } else if (opponent.subscription) {
            // ... your push notification logic ...
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
    
    // Use `server.listen` because our server is now the `http` instance
    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });