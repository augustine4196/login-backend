//-- Your original imports
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

//-- NEW: Add these two required modules for real-time functionality
const http = require('http');
const { Server } = require("socket.io");

//-- Your original model imports
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
//-- NEW: Add the new Challenge model. Make sure the file 'models/Challenge.js' exists.
const Challenge = require('./models/Challenge');

const app = express();

//-- MODIFICATION: Create an HTTP server from your Express app.
const server = http.createServer(app);

//-- NEW: Initialize Socket.IO and attach it to the server.
const io = new Server(server, {
  cors: {
    origin: ["https://personalize-fitness-trainer.netlify.app", "https://fitflow.netlify.app"],
    methods: ["GET", "POST"]
  }
});

//-- MODIFICATION: Making the CORS configuration more specific.
app.use(cors({
    origin: ["https://personalize-fitness-trainer.netlify.app", "https://fitflow.netlify.app"]
}));
app.use(bodyParser.json());

//-- =================================================================
//--               REAL-TIME CHALLENGE LOGIC
//-- =================================================================
const userSockets = {};

io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);

    socket.on('register', (userEmail) => {
        if (userEmail) {
            console.log(`User '${userEmail}' registered with socket ${socket.id}`);
            userSockets[userEmail] = socket.id;
        }
    });

    socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
        await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
        const challengerSocketId = userSockets[challengerEmail];
        if (challengerSocketId) {
            io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
        }
        socket.emit('challenge-accepted-redirect', { challengeRoomId });
    });

    // --- WebRTC Signaling Events ---
    socket.on('join-challenge-room', (roomName) => {
        // Associate the socket with the room name for easy lookup on disconnect
        socket.roomName = roomName;
        socket.join(roomName);
        // Notify the *other* peer in the room that someone has joined
        socket.to(roomName).emit('peer-joined');
    });
    socket.on('webrtc-offer', (data) => socket.to(data.roomName).emit('webrtc-offer', data.sdp));
    socket.on('webrtc-answer', (data) => socket.to(data.roomName).emit('webrtc-answer', data.sdp));
    socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate));

    // --- Original Simple Game Logic Events ---
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

    // --- NEW: AI REPS CHALLENGE GAME SYNC EVENTS ---
    // These are new and do not conflict with the old ones.
    socket.on('start-game', ({ roomName, winningScore }) => {
        console.log(`AI Game started in room ${roomName} with winning score ${winningScore}`);
        socket.to(roomName).emit('game-start-sync', winningScore);
    });
    socket.on('rep-update', ({ roomName, count }) => {
        socket.to(roomName).emit('opponent-rep-update', count);
    });
    socket.on('finish-game', ({ roomName, winnerEmail }) => {
        console.log(`AI Game finished in room ${roomName}. Winner: ${winnerEmail}`);
        io.to(roomName).emit('game-over-sync', { winnerEmail });
    });
    // --- END OF NEW EVENTS ---

    socket.on('disconnect', () => {
        console.log(`❌ WebSocket User disconnected: ${socket.id}`);
        // Notify the other user in the room that their opponent has left
        if (socket.roomName) {
            socket.to(socket.roomName).emit('peer-disconnected');
        }
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
// ... and so on for all your other original routes. They are not shown for brevity but are unchanged.


// --- MODIFIED & NEW ROUTES FOR THE CHALLENGE FEATURE ---
app.post('/send-challenge', async (req, res) => { /* ...your original code... */ });
app.get('/challenges/received/:email', async (req, res) => { /* ...your original code... */ });


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    server.listen(PORT, () => {
      console.log(`🚀 Server with Real-Time support running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });