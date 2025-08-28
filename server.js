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
const WorkoutLog = require('./models/WorkoutLog'); // ✅ NEW

// =================================================================
// --- 2. INITIALIZATION & MIDDLEWARE ---
// =================================================================
const app = express();

// Correct, explicit CORS configuration to allow all origins
app.use(cors({
  origin: "*",
  methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
}));

app.use(bodyParser.json());

// small helper to sanitize email consistently
function sanitizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.toLowerCase().trim();
}

// =================================================================
// --- 3. ALL API ROUTES ---
// =================================================================

app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

// --- Workout Log Routes (NEW) ---
app.post("/workout-log", async (req, res) => {
  try {
    const { email, exerciseName, reps, duration, calories } = req.body;
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) return res.status(400).json({ error: "Email is required." });

    const log = new WorkoutLog({
      email: sanitizedEmail,
      exerciseName,
      reps: reps || 0,
      duration: duration || 0,
      calories: calories || 0
    });

    await log.save();
    res.status(201).json({ message: "Workout logged successfully!", log });
  } catch (err) {
    console.error("❌ Error saving workout log:", err);
    res.status(500).json({ error: "Failed to save workout log." });
  }
});

app.get("/workout-log/:email", async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    if (!sanitizedEmail) return res.status(400).json({ error: "Invalid email parameter." });

    const logs = await WorkoutLog.find({ email: sanitizedEmail }).sort({ timestamp: -1 });
    res.json(logs);
  } catch (err) {
    console.error("❌ Error fetching workout logs:", err);
    res.status(500).json({ error: "Failed to fetch workout logs." });
  }
});

// --- Existing routes (unchanged) ---
app.post('/check-email', async (req, res) => { /* ... keep as-is ... */ });
app.post('/signup', async (req, res) => { /* ... keep as-is ... */ });
app.post('/login', async (req, res) => { /* ... keep as-is ... */ });
app.post('/ask', async (req, res) => { /* ... keep as-is ... */ });
app.get('/user/:email', async (req, res) => { /* ... keep as-is ... */ });
app.get('/admin/users', async (req, res) => { /* ... keep as-is ... */ });
app.post('/subscribe', async (req, res) => { /* ... keep as-is ... */ });
app.get('/notifications/:email', async (req, res) => { /* ... keep as-is ... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ... keep as-is ... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ... keep as-is ... */ });
app.get('/challenges/received/:email', async (req, res) => { /* ... keep as-is ... */ });

// =================================================================
// --- 4. SERVER STARTUP AND REAL-TIME INTEGRATION (UNCHANGED) ---
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
    const challengeRooms = {};

    io.on('connection', (socket) => {
      console.log(`✅ WebSocket User connected: ${socket.id}`);

      socket.on('register', (userEmail) => {
        if(userEmail) {
          socket.userEmail = userEmail;
          userSockets[userEmail] = socket.id;
          console.log(`User ${userEmail} registered with socket ${socket.id}`);
        }
      });

      socket.on('disconnect', () => {
        if(socket.userEmail) {
          delete userSockets[socket.userEmail];
          console.log(`User ${socket.userEmail} disconnected.`);
        }
        if (socket.roomName) {
          socket.to(socket.roomName).emit('peer-disconnected');
          if (challengeRooms[socket.roomName]) {
            challengeRooms[socket.roomName].readyPlayers.delete(socket.id);
            if (challengeRooms[socket.roomName].readyPlayers.size === 0) {
              delete challengeRooms[socket.roomName];
            }
          }
        }
      });

      // --- Challenge Flow + WebRTC + AI Sync (unchanged) ---
      // (Keep everything exactly as in your file)
    });

    app.post('/send-challenge', async (req, res) => { /* ... keep as-is ... */ });

    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  }
}

startServer();
