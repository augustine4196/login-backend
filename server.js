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

// Correct, explicit CORS configuration to allow all origins
app.use(cors({
  origin: "*", // This allows all origins
  methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS", // Explicitly allow methods
  allowedHeaders: "Content-Type, Authorization" // Explicitly allow headers
}));

app.use(bodyParser.json());


// =================================================================
// --- 3. ALL API ROUTES (UNCHANGED) ---
// =================================================================

app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

// --- User Account Routes ---
app.post('/signup', async (req, res) => {
  const { fullName, email, password, gender, age, height, weight, place, equipments, goal, profileImage } = req.body;
  try {
    const sanitizedEmail = email.toLowerCase().trim();
    if (!fullName || !sanitizedEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    const existingUser = await User.findOne({ email: sanitizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }
    const newUser = new User({ fullName, email: sanitizedEmail, password, gender, age, height, weight, place, equipments, goal, profileImage });
    await newUser.save();
    res.status(201).json({ message: "Account created successfully!" });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "User not found." });
    if (String(user.password) !== String(password)) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    res.status(200).json({
      message: "Login successful!",
      fullName: user.fullName,
      email: user.email,
      profileImage: user.profileImage || null
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// --- Chatbot Route ---
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'No question provided.' });
  }
  try {
    // ⭐ Future AI logic will go here. For now, it confirms the connection.
    const botResponse = `You asked: "${question}". The connection is working!`;
    res.status(200).json({ answer: botResponse });
  } catch (error) {
    console.error("❌ Error in /ask route:", error);
    res.status(500).json({ error: "Something went wrong while processing your question." });
  }
});

// --- User Data Routes (USER SEARCH IS NOW FIXED) ---
app.get('/user/:email', async (req, res) => {
    try {
        // Find user by email, but exclude the password field for security.
        const user = await User.findOne({ email: req.params.email }).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json(user); // Send back the user data as JSON.
    } catch (err) {
        console.error("❌ Error fetching user:", err);
        res.status(500).json({ error: 'Failed to fetch user data.' });
    }
});

app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

// --- Notification Routes (FULLY RESTORED) ---
app.post('/subscribe', async (req, res) => {
    // This is a placeholder for web push notification logic.
    // For now, it just confirms the request was received.
    res.status(200).json({ message: 'Subscription endpoint is active.' });
});

app.get('/notifications/:email', async (req, res) => {
    try {
        const notifications = await Notification.find({ recipientEmail: req.params.email }).sort({ timestamp: -1 });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});

app.post('/notifications/mark-read/:email', async (req, res) => {
    try {
        await Notification.updateMany({ recipientEmail: req.params.email, read: false }, { $set: { read: true } });
        res.status(200).send({ message: 'All notifications marked as read.'});
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notifications as read.' });
    }
});

app.get('/notifications/unread-count/:email', async (req, res) => {
    try {
        const count = await Notification.countDocuments({ recipientEmail: req.params.email, read: false });
        res.json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get unread count.' });
    }
});

// --- Challenge Routes ---
app.get('/challenges/received/:email', async (req, res) => {
    try {
        const challenges = await Challenge.find({ opponentEmail: req.params.email, status: 'pending' }).sort({ timestamp: -1 });
        res.json(challenges);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
});


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
        // ⭐ 1. ADDED state object to track ready players in each room.
        const challengeRooms = {};

        // All real-time logic goes inside the connection handler
        io.on('connection', (socket) => {
            console.log(`✅ WebSocket User connected: ${socket.id}`);
            
            socket.on('register', (userEmail) => {
                if(userEmail) {
                    socket.userEmail = userEmail;
                    userSockets[userEmail] = socket.id;
                    console.log(`User ${userEmail} registered with socket ${socket.id}`);
                }
            });

            // ⭐ 3. UPDATED disconnect handler to include cleanup logic.
            socket.on('disconnect', () => {
                if(socket.userEmail) {
                    delete userSockets[socket.userEmail];
                    console.log(`User ${socket.userEmail} disconnected.`);
                }
                // Also handle disconnecting from a challenge room
                if (socket.roomName) {
                    socket.to(socket.roomName).emit('peer-disconnected');

                    // Clean up the ready state for the room
                    if (challengeRooms[socket.roomName]) {
                        challengeRooms[socket.roomName].readyPlayers.delete(socket.id);
                        console.log(`Cleaned up ready state for player ${socket.id} in room ${socket.roomName}.`);
                        // Optional: If the room is now empty, delete it
                        if (challengeRooms[socket.roomName].readyPlayers.size === 0) {
                            delete challengeRooms[socket.roomName];
                            console.log(`Room ${socket.roomName} is now empty and has been removed from state.`);
                        }
                    }
                }
            });
            
            // Challenge Flow
            socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
                await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
                const challengerSocketId = userSockets[challengerEmail];
                if (challengerSocketId) {
                    io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
                }
                socket.emit('challenge-accepted-redirect', { challengeRoomId });
            });
            
            // Challenge Setup Sync
            socket.on('setup-change', ({ roomName, exercise, reps }) => {
                socket.to(roomName).emit('setup-update', { exercise, reps });
            });

            socket.on('start-challenge-now', ({ roomName, exercise, reps }) => {
                io.to(roomName).emit('start-the-challenge', { exercise, reps });
            });

            // WebRTC Signaling
            socket.on('join-challenge-room', (roomName) => {
                socket.roomName = roomName;
                socket.join(roomName);
                socket.to(roomName).emit('peer-joined');
            });
            socket.on('webrtc-offer', (data) => socket.to(data.roomName).emit('webrtc-offer', data.sdp));
            socket.on('webrtc-answer', (data) => socket.to(data.roomName).emit('webrtc-answer', data.sdp));
            socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate));

            // ⭐ 2. ADDED listener for the new 'player-ready' event.
            socket.on('player-ready', (roomName) => {
                // Ensure the room exists in our state tracker
                if (!challengeRooms[roomName]) {
                    // Using a Set ensures we don't count the same player twice
                    challengeRooms[roomName] = { readyPlayers: new Set() };
                }
                
                // Add the current player's socket ID to the ready set
                challengeRooms[roomName].readyPlayers.add(socket.id);
                console.log(`Player ${socket.id} in room ${roomName} has signaled they are ready.`);

                // Check if both players are now ready
                if (challengeRooms[roomName].readyPlayers.size === 2) {
                    console.log(`Both players in room ${roomName} are ready. Notifying clients.`);
                    // Notify everyone in the room to enable their start buttons
                    io.to(roomName).emit('all-players-ready');
                }
            });

            // AI Game Sync
            socket.on('start-game', ({ roomName, winningScore }) => io.to(roomName).emit('game-start-sync', winningScore));
            socket.on('rep-update', ({ roomName, count }) => socket.to(roomName).emit('opponent-rep-update', count));
            socket.on('finish-game', ({ roomName, winnerEmail }) => io.to(roomName).emit('game-over-sync', { winnerEmail }));
        });

        // The route that needs access to `io`
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

        // Finally, start listening.
        server.listen(PORT, () => {
            console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
        });

    } catch (err) {
        console.error("❌ MongoDB connection error: Could not start server.", err);
        process.exit(1);
    }
}

startServer();