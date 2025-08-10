// Your original imports
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// NEW: Required module for Socket.IO.
const { Server } = require("socket.io");

// Your original model imports
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge'); // Ensure 'models/Challenge.js' exists

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- GLOBAL VARIABLES for Real-Time logic ---
// We declare these here so all routes can access them.
let io;
const userSockets = {};

// =================================================================
// --- ALL API ROUTES ARE DEFINED HERE (BEFORE THE SERVER STARTS) ---
// =================================================================

// --- Your original, working API routes ---
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

// The /send-challenge route is now correctly placed here.
// It can safely reference the `io` and `userSockets` variables
// because they will be initialized before any user can call this route.
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
        console.log(`Attempting to send real-time event to '${toEmail}'. Found socket ID: ${opponentSocketId || 'Not Online'}`);
        if (opponentSocketId) {
            io.to(opponentSocketId).emit('new-challenge', newChallenge);
        } else if (opponent.subscription) {
            const payload = JSON.stringify({ title: 'New Challenge Received', message: `${fromName} has challenged you!` });
            webpush.sendNotification(opponent.subscription, payload).catch(err => console.error("Push notification failed", err));
        }
        res.status(200).json({ message: 'Challenge sent successfully.' });
    } catch (error) {
        console.error('❌ Error in /send-challenge:', error);
        res.status(500).json({ error: 'Failed to send challenge.' });
    }
});

// =================================================================
// --- SERVER STARTUP and REAL-TIME INITIALIZATION ---
// =================================================================
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // Start the HTTP server.
    const server = app.listen(PORT, () => {
      console.log(`🚀 HTTP Server running on port ${PORT}`);
    });

    // Initialize Socket.IO and attach it to the server.
    io = new Server(server, {
        cors: {
            origin: "*", // Keep open for testing
        }
    });

    // --- Set up all real-time event listeners ---
    io.on('connection', (socket) => {
        console.log(`✅ WebSocket User connected: ${socket.id}`);
        
        // Register and Disconnect Logic
        socket.on('register', (userEmail) => {
            if (userEmail) { userSockets[userEmail] = socket.id; console.log('Current online users:', Object.keys(userSockets)); }
        });
        socket.on('disconnect', () => {
            for (const email in userSockets) { if (userSockets[email] === socket.id) { delete userSockets[email]; break; }}
            console.log('Current online users:', Object.keys(userSockets));
        });
        
        // Challenge Flow Logic
        socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
            await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
            const challengerSocketId = userSockets[challengerEmail];
            if (challengerSocketId) { io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId }); }
            socket.emit('challenge-accepted-redirect', { challengeRoomId });
        });

        // WebRTC and Game Sync Logic
        socket.on('join-challenge-room', (roomName) => { /* ...your existing code... */ });
        // ... all other socket.on listeners for WebRTC and game sync ...
    });

  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });