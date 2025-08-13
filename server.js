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
// --- 3. API ROUTES ---
// =================================================================

app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

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

// =================================================================
// --- ⭐️ UPDATED AND CORRECTED CHATBOT ROUTE ⭐️ ---
// =================================================================
app.post('/ask', async (req, res) => {
  const { question } = req.body; // Get the question from the request

  // Validate that a question was actually sent
  if (!question) {
    return res.status(400).json({ error: 'No question provided.' });
  }

  try {
    // --- AI LOGIC GOES HERE ---
    // For now, we'll just create a simple response to prove the connection works.
    // You can replace this line with your actual call to an AI service (like OpenAI).
    const botResponse = `You asked: "${question}". The connection is working! Now you can add your real AI logic.`;

    // Send the response back in the format the frontend expects
    res.status(200).json({ answer: botResponse });

  } catch (error) {
    console.error("❌ Error in /ask route:", error);
    // If anything goes wrong, send a clear error message
    res.status(500).json({ error: "Something went wrong while processing your question." });
  }
});
// =================================================================


app.get('/user/:email', async (req, res) => { /* ...your full, original user code... */ });
app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});
app.post('/subscribe', async (req, res) => { /* ...your full, original subscribe code... */ });
app.get('/notifications/:email', async (req, res) => { /* ...your full, original notifications code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your full, original mark-read code... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your full, original unread-count code... */ });

// --- NEW ROUTES FOR CHALLENGES ---
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
            pingInterval: 20000, // Heartbeat to prevent timeouts on Render
            pingTimeout: 5000,
        });

        const userSockets = {};

        // Define all real-time logic
        io.on('connection', (socket) => {
            console.log(`✅ WebSocket User connected: ${socket.id}`);

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

            // Challenge Flow Listeners
            socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
                await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
                const challengerSocketId = userSockets[challengerEmail];
                if (challengerSocketId) {
                    io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
                }
                socket.emit('challenge-accepted-redirect', { challengeRoomId });
            });

            // WebRTC Listeners
            socket.on('join-challenge-room', (roomName) => {
                socket.roomName = roomName;
                socket.join(roomName);
                socket.to(roomName).emit('peer-joined');
            });
            socket.on('webrtc-offer', (data) => socket.to(data.roomName).emit('webrtc-offer', data.sdp));
            socket.on('webrtc-answer', (data) => socket.to(data.roomName).emit('webrtc-answer', data.sdp));
            socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate));

            // AI Game Sync Listeners
            socket.on('start-game', ({ roomName, winningScore }) => socket.to(roomName).emit('game-start-sync', winningScore));
            socket.on('rep-update', ({ roomName, count }) => socket.to(roomName).emit('opponent-rep-update', count));
            socket.on('finish-game', ({ roomName, winnerEmail }) => io.to(roomName).emit('game-over-sync', { winnerEmail }));
        });

        // Define the one route that needs access to `io`
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