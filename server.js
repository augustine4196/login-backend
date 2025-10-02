// =================================================================
// --- 1. IMPORTS ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Required modules for the correct server structure
const http = require('http');
const { Server } = require("socket.io");

// Model imports
const User = require('./models/User');
const Notification = require('./models/Notification');
const Challenge = require('./models/Challenge');
const ExerciseSession = require('./models/ExerciseSession');

// =================================================================
// --- 2. INITIALIZATION & MIDDLEWARE ---
// =================================================================
const app = express();

// --- THIS IS THE ONLY MODIFICATION: A MORE ROBUST CORS CONFIGURATION ---
// This configuration explicitly allows your Netlify site to make requests and fixes the error.
const allowedOrigins = [
  "https://personalize-fitness-trainer.netlify.app",
  // You can add local development URLs here for testing if needed
  // e.g., "http://127.0.0.1:5500" 
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
}));
// --- END OF MODIFICATION ---


app.use(bodyParser.json());

// small helper to sanitize email consistently
function sanitizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.toLowerCase().trim();
}

// =================================================================
// --- 3. ALL API ROUTES (YOUR ORIGINAL CODE, UNCHANGED) ---
// =================================================================

app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

// --- Check email endpoint (frontend uses this to check availability) ---
app.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) return res.status(400).json({ error: "Email is required." });

    const user = await User.findOne({ email: sanitizedEmail });
    res.status(200).json({ exists: !!user });
  } catch (err) {
    console.error("❌ /check-email error:", err);
    res.status(500).json({ error: "Failed to check email." });
  }
});

// --- User Account Routes ---
app.post('/signup', async (req, res) => {
  const {
    fullName, email, password,
    gender, age, height, weight,
    place, equipments, goal, profileImage
  } = req.body;

  try {
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    const existingUser = await User.findOne({ email: sanitizedEmail });
    const heightInMeters = parseFloat(height) / 100;
    const weightInKg = parseFloat(weight);
    let bmi = null;
    if (!isNaN(heightInMeters) && heightInMeters > 0 && !isNaN(weightInKg)) {
      bmi = parseFloat((weightInKg / (heightInMeters ** 2)).toFixed(2));
    }

    if (existingUser) {
      if (fullName && (typeof password !== 'undefined' && password !== null)) {
        const nameMatches = String(fullName).trim() === String(existingUser.fullName).trim();
        const passMatches = await bcrypt.compare(password, existingUser.password);
        if (!nameMatches || !passMatches) {
          return res.status(409).json({ error: "An account with this email address already exists. Please log in." });
        }
      }
      const profileUpdates = {};
      if (gender !== undefined) profileUpdates.gender = gender;
      if (age !== undefined) profileUpdates.age = age;
      if (height !== undefined) profileUpdates.height = height;
      if (weight !== undefined) profileUpdates.weight = weight;
      if (place !== undefined) profileUpdates.place = place;
      if (goal !== undefined) profileUpdates.goal = goal;
      if (equipments !== undefined) profileUpdates.equipments = equipments;
      if (profileImage !== undefined) profileUpdates.profileImage = profileImage;
      if (bmi !== null) profileUpdates.bmi = bmi;
      if (fullName !== undefined) profileUpdates.fullName = fullName;
      if (password !== undefined && password !== '') {
        const salt = await bcrypt.genSalt(10);
        profileUpdates.password = await bcrypt.hash(password, salt);
      }
      if (Object.keys(profileUpdates).length > 0) {
        await User.updateOne({ email: sanitizedEmail }, { $set: profileUpdates });
      }
      return res.status(200).json({ message: "Profile updated successfully!", email: sanitizedEmail });
    } else {
      if (!fullName || (typeof password === 'undefined' || password === null || password === '')) {
        return res.status(400).json({ error: "Full name and password are required for new account." });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const newUser = new User({ fullName, email: sanitizedEmail, password: hashedPassword, gender, age, height, weight, place, equipments, goal, profileImage, bmi });
      await newUser.save();
      return res.status(201).json({ message: "Account created successfully!", email: sanitizedEmail });
    }
  } catch (err) {
    console.error("❌ Signup/Update error:", err);
    res.status(500).json({ error: "An internal server error occurred. Please try again." });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
        return res.status(401).json({ error: "Invalid credentials." });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    res.status(200).json({ message: "Login successful!", fullName: user.fullName, email: user.email, profileImage: user.profileImage || null });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

app.get('/api/workout-plan/:email', async (req, res) => {
    try {
        const userEmail = sanitizeEmail(decodeURIComponent(req.params.email));
        if (!userEmail) { return res.status(400).json({ error: 'User email is required.' }); }
        const user = await User.findOne({ email: userEmail });
        if (!user || !user.goal) { return res.status(404).json({ error: 'User not found or no goal set for the user.' }); }
        const filePath = path.join(__dirname, 'workout_plans.json');
        const fileContent = await fs.readFile(filePath, 'utf8');
        const allPlans = JSON.parse(fileContent);
        const userGoalKey = user.goal.replace(/\s+/g, '').toLowerCase();
        const currentDayKey = new Date().toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
        const planForGoal = allPlans.workoutPlans[userGoalKey];
        if (!planForGoal) { return res.status(404).json({ error: 'Workout plan for the specified goal not found.' }); }
        const todaysTasks = planForGoal[currentDayKey];
        if (!todaysTasks || todaysTasks.length === 0) { return res.status(404).json({ error: `No tasks found for ${currentDayKey}.` }); }
        res.status(200).json(todaysTasks);
    } catch (error) {
        console.error("❌ Error fetching workout plan:", error);
        res.status(500).json({ error: 'Failed to fetch workout plan.' });
    }
});

app.post('/api/log-exercise', async (req, res) => {
    try {
        const { email, exerciseName, reps, durationSeconds, caloriesBurned } = req.body;
        if (!email || !exerciseName || reps === undefined || durationSeconds === undefined || caloriesBurned === undefined) {
            return res.status(400).json({ error: 'Missing required performance data.' });
        }
        const sanitizedEmail = email.toLowerCase().trim();
        const newSession = new ExerciseSession({ email: sanitizedEmail, exerciseName, reps, durationSeconds, caloriesBurned });
        await newSession.save();
        res.status(201).json({ message: 'Workout session saved successfully!', data: newSession });
    } catch (error) {
        console.error("❌ Error logging exercise session:", error);
        res.status(500).json({ error: 'Failed to save workout session.' });
    }
});

app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) { return res.status(400).json({ error: 'No question provided.' });}
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) { console.error("❌ CRITICAL: OPENROUTER_API_KEY is not set in environment variables."); return res.status(500).json({ error: "Server configuration error: AI service is not configured." });}
  try {
    const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", { model: "google/gemma-3-27b-it:free", messages: [{ role: "system", content: "You are a friendly and helpful fitness assistant. Provide concise and accurate information about workouts, nutrition, and general health." }, { role: "user", content: question }] }, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://personalize-fitness-trainer.netlify.app' } });
    if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message) {
      const botResponse = response.data.choices[0].message.content;
      res.status(200).json({ answer: botResponse });
    } else {
      console.error("❌ Unexpected API response structure:", response.data);
      res.status(500).json({ error: "Received an invalid response from the AI service." });
    }
  } catch (error) {
    console.error("❌ Error calling OpenRouter API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    res.status(500).json({ error: "Sorry, I couldn't get a response from the AI assistant right now." });
  }
});

app.get('/user/:email', async (req, res) => {
  try {
    const rawEmail = req.params.email;
    const sanitizedEmail = sanitizeEmail(decodeURIComponent(rawEmail));
    if (!sanitizedEmail) return res.status(400).json({ error: 'Invalid email parameter.' });
    const user = await User.findOne({ email: sanitizedEmail }).select('-password');
    if (!user) { return res.status(404).json({ error: 'User not found.' }); }
    res.json(user);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ error: 'Failed to fetch user data.' });
  }
});

app.get('/admin/users', async (req, res) => { try { const users = await User.find().select('-password'); res.json(users); } catch (err) { console.error("❌ Error fetching users:", err); res.status(500).json({ error: "Failed to fetch users." }); } });
app.post('/subscribe', async (req, res) => { res.status(200).json({ message: 'Subscription endpoint is active.' }); });
app.get('/notifications/:email', async (req, res) => { try { const sanitizedEmail = sanitizeEmail(req.params.email); const notifications = await Notification.find({ recipientEmail: sanitizedEmail }).sort({ timestamp: -1 }); res.json(notifications); } catch (error) { console.error("❌ Error fetching notifications:", error); res.status(500).json({ error: 'Failed to fetch notifications.' }); } });
app.post('/notifications/mark-read/:email', async (req, res) => { try { const sanitizedEmail = sanitizeEmail(req.params.email); await Notification.updateMany({ recipientEmail: sanitizedEmail, read: false }, { $set: { read: true } }); res.status(200).send({ message: 'All notifications marked as read.'}); } catch (error) { console.error("❌ Error marking notifications read:", error); res.status(500).json({ error: 'Failed to mark notifications as read.' }); } });
app.get('/notifications/unread-count/:email', async (req, res) => { try { const sanitizedEmail = sanitizeEmail(req.params.email); const count = await Notification.countDocuments({ recipientEmail: sanitizedEmail, read: false }); res.json({ unreadCount: count }); } catch (error) { console.error("❌ Error getting unread count:", error); res.status(500).json({ error: 'Failed to get unread count.' }); } });
app.get('/challenges/received/:email', async (req, res) => { try { const sanitizedEmail = sanitizeEmail(req.params.email); const challenges = await Challenge.find({ opponentEmail: sanitizedEmail, status: 'pending' }).sort({ timestamp: -1 }); res.json(challenges); } catch (error) { console.error("❌ Error fetching challenges:", error); res.status(500).json({ error: 'Failed to fetch challenges.' }); } });

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

      socket.on('player-ready', (roomName) => {
        if (!challengeRooms[roomName]) {
          challengeRooms[roomName] = { readyPlayers: new Set() };
        }
        challengeRooms[roomName].readyPlayers.add(socket.id);
        if (challengeRooms[roomName].readyPlayers.size === 2) {
          io.to(roomName).emit('all-players-ready');
        }
      });

      // AI Game Sync
      socket.on('start-game', ({ roomName, winningScore }) => io.to(roomName).emit('game-start-sync', winningScore));
      socket.on('rep-update', ({ roomName, count }) => socket.to(roomName).emit('opponent-rep-update', count));
      socket.on('finish-game', ({ roomName, winnerEmail }) => io.to(roomName).emit('game-over-sync', { winnerEmail }));
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
        console.error("❌ send-challenge error:", error);
        res.status(500).json({ error: 'Failed to send challenge.' });
      }
    });

    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  }
}

startServer();