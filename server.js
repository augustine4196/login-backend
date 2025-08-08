// =================================================================
// --- IMPORTS ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const webpush = require('web-push');
require('dotenv').config();

// --- NEW IMPORTS FOR REAL-TIME FUNCTIONALITY ---
const http = require('http');
const { Server } = require("socket.io");

// --- MODEL IMPORTS ---
const User = require('./models/User');
const Notification = require('./models/Notification'); // Your original notification model
const Challenge = require('./models/Challenge');   // The new, dedicated model for challenges

// =================================================================
// --- SERVER & SOCKET.IO INITIALIZATION ---
// =================================================================
const app = express();
// --- MODIFICATION: Create an HTTP server from the Express app.
// This is necessary because Socket.IO needs to attach to a standard http server,
// not directly to the Express app. This change will NOT break your existing routes.
const server = http.createServer(app);

// --- NEW: Configure and initialize Socket.IO ---
const io = new Server(server, {
  cors: {
    // IMPORTANT: When you deploy, this should be your Netlify URL.
    // For now, "*" is fine for local and remote testing.
    origin: "*", 
    methods: ["GET", "POST"]
  }
});


// --- MIDDLEWARE ---
// This section is unchanged.
app.use(cors());
app.use(bodyParser.json());

// =================================================================
// --- REAL-TIME LOGIC (SOCKET.IO) ---
// This entire block is new. It handles all instant communication.
// =================================================================

// A simple in-memory object to track which user is on which socket
const userSockets = {}; // e.g., { 'user@example.com': 'socketId123' }

io.on('connection', (socket) => {
    console.log(`✅ User connected via WebSocket: ${socket.id}`);

    // When a user logs in, they register their socket with their email
    socket.on('register', (userEmail) => {
        if (userEmail) {
            console.log(`User '${userEmail}' registered with socket ${socket.id}`);
            userSockets[userEmail] = socket.id;
        }
    });

    // When a user accepts a challenge
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, opponentEmail, challengeRoomId }) => {
        await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
        const challengerSocketId = userSockets[challengerEmail];
        
        // Notify BOTH users to redirect to the video challenge room
        if (challengerSocketId) {
            io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
        }
        socket.emit('challenge-accepted-redirect', { challengeRoomId });
    });

    // --- WebRTC Signaling Events ---
    socket.on('join-challenge-room', (roomName) => {
        socket.join(roomName);
        console.log(`User ${socket.id} joined WebRTC room ${roomName}`);
        socket.to(roomName).emit('peer-joined');
    });

    socket.on('webrtc-offer', (data) => socket.to(data.roomName).emit('webrtc-offer', data.sdp) );
    socket.on('webrtc-answer', (data) => socket.to(data.roomName).emit('webrtc-answer', data.sdp) );
    socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate) );

    // --- Game Logic Events ---
    socket.on('challenge-start', async (roomName) => {
        await Challenge.findOneAndUpdate({ challengeRoomId: roomName }, { status: 'active' });
        io.to(roomName).emit('challenge-started');
    });

    socket.on('challenge-finish', async ({ roomName, userEmail }) => {
        const challenge = await Challenge.findOne({ challengeRoomId: roomName });
        if (challenge && challenge.status === 'active') {
            await Challenge.updateOne({ _id: challenge._id }, { status: 'completed', winnerEmail: userEmail });
            io.to(roomName).emit('winner-declared', { winnerEmail: userEmail });
        }
    });

    // Clean up when a user disconnects
    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.id}`);
        for (const email in userSockets) {
            if (userSockets[email] === socket.id) {
                delete userSockets[email];
                break;
            }
        }
    });
});


// =================================================================
// --- YOUR ORIGINAL API ROUTES (UNCHANGED & SAFE) ---
// We are not touching these, so your login will continue to work.
// =================================================================

app.get("/", (req, res) => res.send("✅ FitFlow backend is working!"));
app.post('/signup', async (req, res) => { /* ...your original code... */ });
app.post('/login', async (req, res) => { /* ...your original code... */ });
app.post('/ask', async (req, res) => { /* ...your original code... */ });
app.get('/user/:email', async (req, res) => { /* ...your original code... */ });
app.get('/admin/users', async (req, res) => { /* ...your original code... */ });
app.post('/subscribe', async (req, res) => { /* ...your original code... */ });
app.get('/notifications/:email', async (req, res) => { /* ...your original code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your original code... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your original code... */ });


// =================================================================
// --- MODIFIED & NEW ROUTES FOR CHALLENGES ---
// =================================================================

// --- MODIFIED: /send-challenge route ---
// It now uses the new Challenge model and emits a real-time event.
app.post('/send-challenge', async (req, res) => {
  const { fromName, fromEmail, toEmail } = req.body; // Needs fromEmail now
  try {
    const opponent = await User.findOne({ email: toEmail });
    if (!opponent) return res.status(404).json({ error: 'Recipient not found.' });

    const challengeRoomId = `challenge_${new Date().getTime()}`;
    const newChallenge = new Challenge({
        challengerName: fromName,
        challengerEmail: fromEmail,
        opponentEmail: toEmail,
        challengeRoomId: challengeRoomId
    });
    await newChallenge.save();
    console.log(`📝 Challenge created in DB for room: ${challengeRoomId}`);
    
    // Attempt to send a REAL-TIME event if the user is online
    const opponentSocketId = userSockets[toEmail];
    if (opponentSocketId) {
        io.to(opponentSocketId).emit('new-challenge', newChallenge);
        console.log(` emitted 'new-challenge' to ${toEmail}`);
    } 
    // FALLBACK: Use push notification if the user is offline but subscribed
    else if (opponent.subscription) {
      const payload = JSON.stringify({ title: 'New Challenge!', message: `${fromName} has challenged you on FitFlow!` });
      await webpush.sendNotification(opponent.subscription, payload);
      console.log(" PUSH notification sent as fallback.");
    }
    res.status(200).json({ message: 'Challenge sent successfully.' });
  } catch (error) {
    console.error('❌ Error in /send-challenge:', error);
    res.status(500).json({ error: 'Failed to send challenge.' });
  }
});

// --- NEW: Route to get pending challenges for the notification page ---
app.get('/challenges/received/:email', async (req, res) => {
    try {
        const challenges = await Challenge.find({ 
            opponentEmail: req.params.email,
            status: 'pending' 
        }).sort({ timestamp: -1 });
        res.json(challenges);
    } catch (error) {
        console.error("Error fetching received challenges:", error);
        res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
});


// =================================================================
// --- SERVER STARTUP ---
// =================================================================
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // --- MODIFICATION: Use `server.listen` instead of `app.listen` ---
    // This is the final crucial change. The `server` object knows how to handle
    // both regular HTTP requests (for your login/signup) and WebSocket requests (for real-time).
    server.listen(PORT, () => {
      console.log(`🚀 Server with Real-Time support running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });