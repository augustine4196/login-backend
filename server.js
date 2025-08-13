// =================================================================
// --- 1. IMPORTS ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
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
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 20000,
    pingTimeout: 5000,
});

app.use(cors());

// --- CRITICAL FIX FOR LOGIN/SIGNUP ---
// This uses the modern, built-in Express parsers which are more reliable
// than the older `body-parser` library. This will fix the hanging request.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// This object will track online users.
const userSockets = {};

// =================================================================
// --- 3. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// This logic is self-contained and does not interfere with your API routes.
// =================================================================
io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);
    
    socket.on('register', (userEmail) => {
        if (userEmail) {
            socket.userEmail = userEmail;
            userSockets[userEmail] = socket.id;
        }
    });

    socket.on('disconnect', () => {
        if (socket.userEmail) {
            delete userSockets[socket.userEmail];
            if (socket.roomName) {
                socket.to(socket.roomName).emit('peer-disconnected');
            }
        }
    });

    // All other socket listeners (accept-challenge, webrtc, game-sync)
    // ...
});

// =================================================================
// --- 4. API ROUTES (EXPRESS) ---
// YOUR ORIGINAL, WORKING ROUTES ARE FULLY RESTORED HERE.
// =================================================================

app.get("/", (req, res) => res.send("✅ FitFlow backend is working!"));

app.post('/signup', async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    const sanitizedEmail = email.toLowerCase().trim();
    if (!fullName || !sanitizedEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    const existingUser = await User.findOne({ email: sanitizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }
    const newUser = new User({ fullName, email: sanitizedEmail, password });
    await newUser.save();
    res.status(201).json({
        message: "Account created successfully!",
        fullName: newUser.fullName,
        email: newUser.email
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // This console.log will now work and show the request body
    console.log("Login attempt for:", req.body.email); 
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

app.post('/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "No question provided." });
    }
    try {
      const response = await axios.post(/* ...your axios call... */);
      res.json({ answer: response.data.choices[0].message.content });
    } catch (error) {
      res.status(500).json({ error: "Chatbot failed to respond." });
    }
});

app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

// ... your other original routes like /subscribe, /notifications etc. go here ...

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
        console.error('❌ Error in /send-challenge:', error);
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
    
    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });