//-- Your original imports
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

//-- NEW: Required modules for real-time functionality
const http = require('http');
const { Server } = require("socket.io");

//-- Your original model imports
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
//-- NEW: Add the new Challenge model. Ensure the file 'models/Challenge.js' exists and is named correctly.
const Challenge = require('./models/Challenge');

const app = express();

//-- MODIFICATION: Create an HTTP server from your Express app. This is required for Socket.IO.
const server = http.createServer(app);

//-- NEW: Initialize Socket.IO and attach it to the server.
const io = new Server(server, {
  cors: {
    // Allows requests from both your Netlify domains to prevent CORS errors.
    origin: ["https://personalize-fitness-trainer.netlify.app", "https://fitflow.netlify.app"],
    methods: ["GET", "POST"]
  }
});


//-- Your original middleware setup
//-- MODIFICATION: Making the CORS configuration more specific and secure.
app.use(cors({
    origin: ["https://personalize-fitness-trainer.netlify.app", "https://fitflow.netlify.app"]
}));
app.use(bodyParser.json());


//-- NEW: This block contains all the new real-time logic.
//-- =================================================================
//--               REAL-TIME CHALLENGE LOGIC
//-- =================================================================
const userSockets = {}; // In-memory object to map user emails to their active socket ID

io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);

    socket.on('register', (userEmail) => {
        if (userEmail) {
            console.log(`User '${userEmail}' registered with socket ${socket.id}`);
            userSockets[userEmail] = socket.id;
        }
    });

    socket.on('accept-challenge', async ({ challengeId, challengerEmail, opponentEmail, challengeRoomId }) => {
        await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
        const challengerSocketId = userSockets[challengerEmail];
        
        if (challengerSocketId) {
            io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
        }
        socket.emit('challenge-accepted-redirect', { challengeRoomId });
    });

    // --- WebRTC Signaling Events ---
    socket.on('join-challenge-room', (roomName) => {
        socket.join(roomName);
        socket.to(roomName).emit('peer-joined');
    });
    socket.on('webrtc-offer', (data) => socket.to(data.roomName).emit('webrtc-offer', data.sdp));
    socket.on('webrtc-answer', (data) => socket.to(data.roomName).emit('webrtc-answer', data.sdp));
    socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate));

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

    socket.on('disconnect', () => {
        console.log(`❌ WebSocket User disconnected: ${socket.id}`);
        for (const email in userSockets) {
            if (userSockets[email] === socket.id) {
                delete userSockets[email];
                break;
            }
        }
    });
});
//-- =================================================================
//--               END OF REAL-TIME LOGIC
//-- =================================================================


// --- ALL YOUR ORIGINAL API ROUTES ARE UNTOUCHED AND SAFE ---
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


// --- MODIFIED & NEW ROUTES FOR THE CHALLENGE FEATURE ---

//-- MODIFIED: Your /send-challenge route is upgraded to use the new system.
app.post('/send-challenge', async (req, res) => {
  const { fromName, fromEmail, toEmail } = req.body;
  try {
    const opponent = await User.findOne({ email: toEmail });
    if (!opponent) {
        return res.status(404).json({ error: 'Recipient not found.' });
    }

    const challengeRoomId = `challenge_${new Date().getTime()}`;
    const newChallenge = new Challenge({
        challengerName: fromName,
        challengerEmail: fromEmail,
        opponentEmail: toEmail,
        challengeRoomId: challengeRoomId
    });
    await newChallenge.save();
    console.log(`📝 Challenge created in DB for room: ${challengeRoomId}`);

    const opponentSocketId = userSockets[toEmail];

    //-- CRITICAL CORRECTION: Added this log for debugging.
    console.log(`Attempting to send real-time event to '${toEmail}'. Found socket ID: ${opponentSocketId || 'Not Online'}`);

    if (opponentSocketId) {
        io.to(opponentSocketId).emit('new-challenge', newChallenge);
        console.log(`✅ Emitted 'new-challenge' event to socket ${opponentSocketId}.`);
    } else if (opponent.subscription) {
      console.log(`User not online via socket. Attempting PUSH notification fallback.`);
      const payload = JSON.stringify({ title: 'New Challenge Received', message: `${fromName} has challenged you!` });
      webpush.sendNotification(opponent.subscription, payload).catch(err => console.error("Push notification failed", err));
    } else {
      console.log(`User '${toEmail}' is not online and has no push subscription.`);
    }

    res.status(200).json({ message: 'Challenge sent successfully.' });
  } catch (error) {
    console.error('❌ Error in /send-challenge:', error);
    res.status(500).json({ error: 'Failed to send challenge.' });
  }
});

//-- NEW: A new route specifically for fetching pending challenges.
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


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    //-- MODIFICATION: Use `server.listen` to start the server.
    //-- This is correct and enables both HTTP and WebSocket connections.
    server.listen(PORT, () => {
      console.log(`🚀 Server with Real-Time support running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });