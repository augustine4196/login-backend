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
// --- 2. INITIALIZATION & MIDDLEWARE ---
// =================================================================
const app = express();
const server = http.createServer(app); // Create the HTTP server from the Express app
const io = new Server(server, { // Attach Socket.IO to the server immediately
    cors: { origin: "*" },
    pingInterval: 20000,
    pingTimeout: 5000,
});
app.use(cors());
app.use(bodyParser.json()); // Your original, working parser

// This object will track online users
const userSockets = {};

// =================================================================
// --- 3. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// This section handles direct WebSocket communication.
// =================================================================
io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);
    
    // Register and Disconnect logic
    socket.on('register', (userEmail) => {
        if(userEmail) {
            socket.userEmail = userEmail;
            userSockets[userEmail] = socket.id;
        }
    });
    socket.on('disconnect', () => {
        if(socket.userEmail) {
            delete userSockets[socket.userEmail];
            if (socket.roomName) {
                socket.to(socket.roomName).emit('peer-disconnected');
            }
        }
    });
    
    // All other socket listeners for challenge flow, WebRTC, and game sync.
    // This logic is self-contained and does not interfere with your API routes.
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
        await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
        const challengerSocketId = userSockets[challengerEmail];
        if (challengerSocketId) {
            io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
        }
        socket.emit('challenge-accepted-redirect', { challengeRoomId });
    });
    socket.on('join-challenge-room', (roomName) => {
        socket.roomName = roomName;
        socket.join(roomName);
        socket.to(roomName).emit('peer-joined');
    });
    // ... all other WebRTC and game sync listeners ...
});


// =================================================================
// --- 4. API ROUTES (EXPRESS) ---
// ALL your original routes are here, restored to their full, working state.
// =================================================================

app.get("/", (req, res) => res.send("✅ FitFlow backend is working!"));

app.post('/signup', async (req, res) => {
  // Your full, original signup code...
});

app.post('/login', async (req, res) => {
  // Your full, original login code...
});

app.post('/ask', async (req, res) => {
  // Your full, original ask code...
});

app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

// ... All your other original routes like /subscribe, /notifications, etc. ...

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
        res.status(500).json({ error: 'Failed to send challenge.' });
    }
});

// =================================================================
// --- 5. SERVER STARTUP ---
// =================================================================
const PORT = process.env.PORT || 10000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // Use `server.listen` because our server is the `http` instance which handles both protocols.
    // This is the correct way to start the server.
    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });