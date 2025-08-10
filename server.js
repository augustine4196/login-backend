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

// Use a very open CORS setting for now to eliminate it as a potential error source.
app.use(cors());
app.use(bodyParser.json());

// --- ALL YOUR ORIGINAL, WORKING API ROUTES ---
// These are untouched to ensure your login and other features work perfectly.
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

// --- NEW & MODIFIED ROUTES FOR CHALLENGES ---
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
    
    // Start the HTTP server using your original, working app.listen() method.
    const server = app.listen(PORT, () => {
      console.log(`🚀 HTTP Server running on port ${PORT}`);
    });

    // Attach Socket.IO to the running server instance.
    const io = new Server(server, {
        cors: {
            origin: "*", // Open for testing.
        }
    });

    // --- REAL-TIME LOGIC & THE FINAL API ROUTE ---
    const userSockets = {};

    io.on('connection', (socket) => {
        console.log(`✅ A WebSocket client connected: ${socket.id}`);
        
        socket.on('register', (userEmail) => {
            // -- CORRECTION: Added more robust logging --
            if (userEmail) {
                console.log(`-> Event 'register': User '${userEmail}' is binding to socket ${socket.id}`);
                userSockets[userEmail] = socket.id;
                // -- Log the current state of all online users for debugging --
                console.log('   Current online users:', Object.keys(userSockets));
            } else {
                console.warn(`-> Event 'register': Received an empty userEmail from socket ${socket.id}`);
            }
        });

        socket.on('disconnect', () => {
            // -- CORRECTION: Added more robust logging --
            let disconnectedUser = null;
            for (const email in userSockets) {
                if (userSockets[email] === socket.id) {
                    disconnectedUser = email;
                    delete userSockets[email];
                    break;
                }
            }
            if (disconnectedUser) {
                console.log(`❌ User '${disconnectedUser}' (socket ${socket.id}) disconnected.`);
                console.log('   Current online users:', Object.keys(userSockets));
            } else {
                console.log(`❌ An unregistered socket (${socket.id}) disconnected.`);
            }
        });
        
        // The rest of the socket events are correct.
        socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => { /* ...your code... */ });
        socket.on('join-challenge-room', (roomName) => { /* ...your code... */ });
        socket.on('webrtc-offer', (data) => { /* ...your code... */ });
        socket.on('webrtc-answer', (data) => { /* ...your code... */ });
        socket.on('webrtc-ice-candidate', (data) => { /* ...your code... */ });
        socket.on('challenge-start', async (roomName) => { /* ...your code... */ });
        socket.on('challenge-finish', async ({ roomName, userEmail }) => { /* ...your code... */ });
    });
    
    // The /send-challenge route MUST be defined *after* `io` is initialized.
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
        
        // -- CORRECTION: More detailed logging --
        console.log(`\n--- Sending Challenge ---`);
        console.log(`From: ${fromEmail}`);
        console.log(`To: ${toEmail}`);
        console.log(`Searching for socket ID for '${toEmail}'...`);
        console.log(`Result: ${opponentSocketId ? `FOUND (${opponentSocketId})` : 'NOT FOUND (User is not online via socket)'}`);
        console.log(`--- End Sending Challenge ---\n`);
        
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
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });