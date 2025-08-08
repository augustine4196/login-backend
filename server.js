// server.js

// --- CORE AND UTILITY IMPORTS ---
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const http = require('http'); // Required for Socket.IO
const { Server } = require("socket.io"); // Required for Socket.IO
const webpush = require('web-push');
require('dotenv').config();

// --- MODEL IMPORTS ---
const User = require('./models/User');
const Notification = require('./models/Notification'); // Still used for generic notifications
const Challenge = require('./models/Challenge'); // Our new, powerful Challenge model

// --- INITIALIZATION ---
const app = express();
const server = http.createServer(app); // Create an HTTP server from the Express app

// Configure Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // IMPORTANT: For production, change this to your Netlify URL: "https://fitflow.netlify.app"
    methods: ["GET", "POST"]
  }
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// --- IN-MEMORY USER TRACKING (for real-time connections) ---
// Maps a user's email to their current socket ID for direct messaging
const userSockets = {}; // e.g., { 'user@example.com': 'socketId123' }

// =================================================================
// ---  SOCKET.IO REAL-TIME LOGIC ---
// This block handles all instant communication for challenges
// =================================================================
io.on('connection', (socket) => {
    console.log(`✅ User connected with socket ID: ${socket.id}`);

    // When a user logs in or visits a page, they register their socket
    socket.on('register', (userEmail) => {
        if (userEmail) {
            console.log(`User '${userEmail}' registered with socket ${socket.id}`);
            userSockets[userEmail] = socket.id;
        }
    });

    // When an opponent accepts a challenge from the notification page
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, opponentEmail, challengeRoomId }) => {
        try {
            await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });

            const challengerSocketId = userSockets[challengerEmail];
            
            // Notify BOTH users to redirect to the video challenge room
            if (challengerSocketId) {
                io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
            }
            socket.emit('challenge-accepted-redirect', { challengeRoomId }); // Notify the user who just accepted

        } catch (error) {
            console.error("Error during 'accept-challenge':", error);
        }
    });

    // --- WebRTC Video Call Logic ---

    // When a user arrives at the challenge page, they join a specific room
    socket.on('join-challenge-room', (roomName) => {
        socket.join(roomName);
        console.log(`User ${socket.id} joined WebRTC room ${roomName}`);
        // Notify the *other* user in the room that a peer has joined so they can initiate the call
        socket.to(roomName).emit('peer-joined');
    });

    // These events simply relay WebRTC handshake messages between the two peers in a room
    socket.on('webrtc-offer', (data) => {
        socket.to(data.roomName).emit('webrtc-offer', data.sdp);
    });

    socket.on('webrtc-answer', (data) => {
        socket.to(data.roomName).emit('webrtc-answer', data.sdp);
    });

    socket.on('webrtc-ice-candidate', (data) => {
        socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate);
    });

    // --- Real-time Game State Logic ---
    socket.on('challenge-start', async (roomName) => {
        // Update DB status and notify both users to start
        await Challenge.findOneAndUpdate({ challengeRoomId: roomName }, { status: 'active' });
        io.to(roomName).emit('challenge-started');
    });

    socket.on('challenge-finish', async ({ roomName, userEmail }) => {
        const challenge = await Challenge.findOne({ challengeRoomId: roomName });
        // First one to finish wins! This check prevents race conditions.
        if (challenge && challenge.status === 'active') {
            await Challenge.updateOne({ _id: challenge._id }, { status: 'completed', winnerEmail: userEmail });
            // Announce the winner to everyone in the room
            io.to(roomName).emit('winner-declared', { winnerEmail: userEmail });
        }
    });

    // Clean up the userSockets map on disconnect
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
// --- REST API ROUTES ---
// This block handles all standard HTTP requests
// =================================================================

// Keep all your existing, working routes...
app.get("/", (req, res) => res.send("✅ FitFlow backend is working!"));
app.post('/signup', async (req, res) => { /* ...your existing code... */ });
app.post('/login', async (req, res) => { /* ...your existing code... */ });
app.post('/ask', async (req, res) => { /* ...your existing code... */ });
app.get('/user/:email', async (req, res) => { /* ...your existing code... */ });
app.get('/admin/users', async (req, res) => { /* ...your existing code... */ });
app.post('/subscribe', async (req, res) => { /* ...your existing code... */ });


// --- MODIFIED & NEW API ROUTES FOR CHALLENGES ---

// NEW: Get all challenges where the user is the opponent (for the notification page)
app.get('/challenges/received/:email', async (req, res) => {
    try {
        const challenges = await Challenge.find({ 
            opponentEmail: req.params.email,
            status: 'pending' // Only show pending challenges they can act on
        }).sort({ timestamp: -1 });
        res.json(challenges);
    } catch (error) {
        console.error("Error fetching received challenges:", error);
        res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
});


// MODIFIED: This route now creates a Challenge document and emits a socket event.
app.post('/send-challenge', async (req, res) => {
    const { fromName, fromEmail, toEmail } = req.body;
    try {
        if (!fromName || !fromEmail || !toEmail) {
            return res.status(400).json({ error: 'Missing required challenge information.'});
        }
        
        const opponent = await User.findOne({ email: toEmail });
        if (!opponent) {
            return res.status(404).json({ error: 'Recipient not found.' });
        }

        // 1. Create a unique ID for the real-time room
        const challengeRoomId = `challenge_${new Date().getTime()}`;

        // 2. Create the challenge record in the database
        const newChallenge = new Challenge({
            challengerName: fromName,
            challengerEmail: fromEmail,
            opponentEmail: toEmail,
            challengeRoomId: challengeRoomId
        });
        await newChallenge.save();
        console.log(`📝 Challenge created in DB for room: ${challengeRoomId}`);

        // 3. Emit a REAL-TIME event to the opponent if they are currently online
        const opponentSocketId = userSockets[toEmail];
        if (opponentSocketId) {
            io.to(opponentSocketId).emit('new-challenge', newChallenge);
            console.log(` GEmitted 'new-challenge' event to ${toEmail}`);
        } else {
             // 4. (FALLBACK) Send a PUSH notification if the opponent is offline but subscribed
            if (opponent.subscription) {
                const payload = JSON.stringify({ title: 'New Challenge!', message: `${fromName} has challenged you on FitFlow! 💪` });
                await webpush.sendNotification(opponent.subscription, payload);
                console.log(" PUSH notification sent as fallback.");
            }
        }
    
        res.status(200).json({ message: 'Challenge sent successfully.', challenge: newChallenge });
    } catch (error) {
        console.error('❌ Error in /send-challenge:', error);
        res.status(500).json({ error: 'Failed to send challenge.' });
    }
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("🗄️  Connected to MongoDB Atlas");
    
    // IMPORTANT: Use the http `server` to listen, not the Express `app`
    server.listen(PORT, () => {
      console.log(`🚀 Server with Real-Time support running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });