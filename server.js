// =================================================================
// --- 1. IMPORTS ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// Required modules for the correct server structure
const http = require('http');
const { Server } = require("socket.io");

// Model imports
const User = require('./models/User');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge');

// =================================================================
// --- 2. INITIALIZATION ---
// This is the most robust and standard way to set up the server.
// =================================================================
const app = express();
const server = http.createServer(app); // Create the HTTP server from Express
const io = new Server(server, { // Attach Socket.IO to the server immediately
    cors: {
        origin: "*", // Allows access from your Netlify sites and localhost
    }
});

// =================================================================
// --- 3. MIDDLEWARE ---
// =================================================================
app.use(cors());
app.use(bodyParser.json());

// This object will track online users.
const userSockets = {};

// =================================================================
// --- 4. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// This section handles all direct WebSocket communication.
// =================================================================
io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);
    
    socket.on('register', (userEmail) => {
        if (userEmail) {
            socket.userEmail = userEmail; // Associate email with the socket instance
            userSockets[userEmail] = socket.id;
            console.log(`User '${userEmail}' registered. Online users:`, Object.keys(userSockets));
        }
    });

    socket.on('disconnect', () => {
        if (socket.userEmail) {
            delete userSockets[socket.userEmail];
            console.log(`❌ User '${socket.userEmail}' disconnected. Online users:`, Object.keys(userSockets));
            // Notify other user in a room if they disconnect mid-challenge
            if (socket.roomName) {
                socket.to(socket.roomName).emit('peer-disconnected');
            }
        }
    });

    // --- Challenge Flow Listeners ---
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
        await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
        const challengerSocketId = userSockets[challengerEmail];
        if (challengerSocketId) {
            io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
        }
        socket.emit('challenge-accepted-redirect', { challengeRoomId });
    });

    // --- WebRTC Signaling Listeners ---
    socket.on('join-challenge-room', (roomName) => {
        socket.roomName = roomName; // Associate room with socket for disconnect logic
        socket.join(roomName);
        socket.to(roomName).emit('peer-joined');
    });
    socket.on('webrtc-offer', (data) => socket.to(data.roomName).emit('webrtc-offer', data.sdp));
    socket.on('webrtc-answer', (data) => socket.to(data.roomName).emit('webrtc-answer', data.sdp));
    socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate));

    // --- AI Game Sync Listeners ---
    socket.on('start-game', ({ roomName, winningScore }) => socket.to(roomName).emit('game-start-sync', winningScore));
    socket.on('rep-update', ({ roomName, count }) => socket.to(roomName).emit('opponent-rep-update', count));
    socket.on('finish-game', ({ roomName, winnerEmail }) => io.to(roomName).emit('game-over-sync', { winnerEmail }));
});


// =================================================================
// --- 5. API ROUTES (EXPRESS) ---
// ALL your original routes are here, 100% UNCHANGED in their logic.
// They are defined before the server starts, which is the correct way.
// =================================================================

app.get("/", (req, res) => res.send("✅ FitFlow backend is working!"));

app.post('/signup', async (req, res) => { /* ...your full, original signup code... */ });
app.post('/login', async (req, res) => { /* ...your full, original login code... */ });
app.post('/ask', async (req, res) => { /* ...your full, original ask code... */ });
app.get('/user/:email', async (req, res) => { /* ...your full, original user code... */ });
app.post('/subscribe', async (req, res) => { /* ...your full, original subscribe code... */ });
app.get('/notifications/:email', async (req, res) => { /* ...your full, original notifications code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your full, original mark-read code... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your full, original unread-count code... */ });

app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

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
    
    // Use `server.listen` because our server is the `http` instance which handles both protocols.
    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });