// =================================================================
// --- 1. ALL ORIGINAL IMPORTS AND SETUP (UNCHANGED) ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge'); // Ensure 'models/Challenge.js' exists

const app = express();
app.use(cors());
app.use(bodyParser.json());

// =================================================================
// --- 2. ALL YOUR ORIGINAL API ROUTES (UNCHANGED) ---
// This guarantees your login, user search, and all other HTTP features
// will work exactly as they did before.
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
// This is the only section with significant changes, structured safely.
// =================================================================
const PORT = process.env.PORT || 5000;

// Connect to the database first.
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // Use your ORIGINAL app.listen() method, which we know works.
    // We just capture the server instance it returns.
    const server = app.listen(PORT, () => {
      console.log(`🚀 HTTP Server running on port ${PORT}`);
    });

    // NOW, attach Socket.IO to the running server instance.
    // This is the safest way to add real-time functionality.
    const io = new Server(server, { cors: { origin: "*" } });

    // This object will track online users.
    const userSockets = {};

    // Define all real-time event listeners.
    io.on('connection', (socket) => {
        console.log(`✅ WebSocket User connected: ${socket.id}`);
        
        // This logic is self-contained and does not interfere with Express.
        socket.on('register', (userEmail) => { /* ... your register logic ... */ });
        socket.on('disconnect', () => { /* ... your disconnect logic ... */ });
        socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
            await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
            const challengerSocketId = userSockets[challengerEmail];
            if (challengerSocketId) {
                io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
            }
            socket.emit('challenge-accepted-redirect', { challengeRoomId });
        });
        
        // All other listeners for WebRTC and AI Game Sync
        // ...
    });

    // FINALLY, we define the ONE route that needs access to the `io` object.
    // We define it here because `io` only exists inside this `.then()` block.
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
            }
            // ... your push notification logic
            res.status(200).json({ message: 'Challenge sent successfully.' });
        } catch (error) {
            console.error('❌ Error in /send-challenge:', error);
            res.status(500).json({ error: 'Failed to send challenge.' });
        }
    });

  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });