// =================================================================
// --- 1. IMPORTS ---
// =================================================================
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
const Challenge = require('./models/Challenge');

// =================================================================
// --- 2. INITIALIZATION & MIDDLEWARE ---
// =================================================================
const app = express();
app.use(cors());
app.use(bodyParser.json());

// =================================================================
// --- 3. ALL ORIGINAL API ROUTES (UNCHANGED) ---
// =================================================================

app.get("/", (req, res) => { /* ...your full, original code... */ });
app.post('/signup', async (req, res) => { /* ...your full, original signup code... */ });
app.post('/login', async (req, res) => { /* ...your full, original login code... */ });
app.post('/ask', async (req, res) => { /* ...your full, original ask code... */ });
app.get('/user/:email', async (req, res) => { /* ...your full, original user code... */ });
app.get('/admin/users', async (req, res) => { /* ...your full, original admin users code... */ });
app.post('/subscribe', async (req, res) => { /* ...your full, original subscribe code... */ });
app.get('/notifications/:email', async (req, res) => { /* ...your full, original notifications code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your full, original mark-read code... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your full, original unread-count code... */ });
app.get('/challenges/received/:email', async (req, res) => { /* ...your full, original challenges code... */ });

// =================================================================
// --- 4. SERVER STARTUP AND REAL-TIME INTEGRATION ---
// =================================================================
const PORT = process.env.PORT || 10000;

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB Atlas");

        const server = http.createServer(app);

        const io = new Server(server, {
            cors: { origin: "*" },
            pingInterval: 20000,
            pingTimeout: 5000,
        });

        const userSockets = {};

        // Define all real-time logic
        io.on('connection', (socket) => {
            console.log(`✅ WebSocket User connected: ${socket.id}`);
            
            socket.on('register', (userEmail) => { /* ...your register logic... */ });
            socket.on('disconnect', () => { /* ...your disconnect logic... */ });
            socket.on('accept-challenge', async (data) => { /* ...your accept logic... */ });
            
            // WebRTC Listeners
            socket.on('join-challenge-room', (roomName) => { /* ...your join logic... */ });
            socket.on('webrtc-offer', (data) => { /* ...your webrtc logic... */ });
            socket.on('webrtc-answer', (data) => { /* ...your webrtc logic... */ });
            socket.on('webrtc-ice-candidate', (data) => { /* ...your webrtc logic... */ });

            // AI Game Sync Listeners
            socket.on('start-game', (data) => { /* ...your AI game logic... */ });
            socket.on('rep-update', (data) => { /* ...your AI game logic... */ });
            socket.on('finish-game', (data) => { /* ...your AI game logic... */ });
            
            // --- THIS IS THE ONLY NEW ADDITION ---
            // These listeners are specifically for the new setup flow on challenge.html
            // and do not conflict with any of your other logic.

            // When a user changes the dropdown or input, relay it to the other user.
            socket.on('setup-change', ({ roomName, exercise, reps }) => {
                socket.to(roomName).emit('setup-update', { exercise, reps });
            });

            // When a user clicks "Start", tell EVERYONE in the room to start and redirect.
            socket.on('start-challenge-now', ({ roomName, exercise, reps }) => {
                console.log(`Broadcasting start command for ${exercise} to room ${roomName}`);
                io.to(roomName).emit('start-the-challenge', { exercise, reps });
            });
            // --- END OF NEW ADDITION ---
        });

        // This route is correctly defined and working.
        app.post('/send-challenge', async (req, res) => {
            // ... your full, working /send-challenge logic ...
        });

        // Finally, start listening for requests.
        server.listen(PORT, () => {
            console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
        });

    } catch (err) {
        console.error("❌ MongoDB connection error: Could not start server.", err);
        process.exit(1);
    }
}

startServer();