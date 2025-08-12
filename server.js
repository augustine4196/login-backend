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
app.use(bodyParser.json()); // Your original, working parser

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
            socket.on('join-challenge-room', (roomName) => { /* ...your join logic... */ });
            socket.on('webrtc-offer', (data) => { /* ...your webrtc logic... */ });
            socket.on('webrtc-answer', (data) => { /* ...your webrtc logic... */ });
            socket.on('webrtc-ice-candidate', (data) => { /* ...your webrtc logic... */ });
            
            // AI Game Sync Listeners
            socket.on('start-game', (data) => { /* ...your AI game logic... */ });
            socket.on('rep-update', (data) => { /* ...your AI game logic... */ });
            socket.on('finish-game', (data) => { /* ...your AI game logic... */ });

            // --- NEW AND FINAL ADDITIONS ---
            // These listeners are specifically for the simple challenge.html page
            // and do not conflict with any of your other logic.

            socket.on('challenge-start', async ({ roomName, exercise, reps }) => {
                // Update the challenge in the database with the selected exercise details
                await Challenge.findOneAndUpdate(
                    { challengeRoomId: roomName }, 
                    { status: 'active', exercise: `${reps} ${exercise}` }
                );
                // Broadcast the start event with the parameters to EVERYONE in the room
                io.to(roomName).emit('challenge-started', { exercise, reps });
            });

            socket.on('challenge-finish', async ({ roomName, userEmail }) => {
                const challenge = await Challenge.findOne({ challengeRoomId: roomName });
                if (challenge && challenge.status === 'active') {
                    await Challenge.updateOne({ _id: challenge._id }, { status: 'completed', winnerEmail: userEmail });
                    io.to(roomName).emit('winner-declared', { winnerEmail: userEmail });
                }
            });
            // --- END OF NEW ADDITIONS ---
        });

        // This route is already correctly defined and working.
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