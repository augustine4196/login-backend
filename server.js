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
  origin: "*", // This allows all origins (okay for dev; lock down in prod)
  methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS", // Explicitly allow methods
  allowedHeaders: "Content-Type, Authorization" // Explicitly allow headers
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

// --- User Account Routes (MODIFIED FOR EMAIL CHECK) ---
/**
 * Handles both initial user creation and subsequent profile updates.
 * - If the email does NOT exist, it creates a new user.
 * - If the email DOES exist:
 *   - If client is attempting a new registration (different fullName/password) -> 409
 *   - Otherwise treat it as a profile update and apply fields that are present.
 *
 * Note: Passwords are still stored as plain text per your request (not secure).
 */
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

    // Check if a user with this email already exists.
    const existingUser = await User.findOne({ email: sanitizedEmail });

    if (existingUser) {
      // User exists -> decide if this is a registration conflict or a profile update.
      // If client supplies both fullName and password and they don't match the existing record,
      // treat as attempted registration (409). But if both match the existing record,
      // proceed with update logic (so final-step updates that resend same password won't conflict).
      if (fullName && (typeof password !== 'undefined')) {
        const nameMatches = String(fullName).trim() === String(existingUser.fullName).trim();
        const passMatches = String(password) === String(existingUser.password);

        // If either name or password don't match, we consider it a registration attempt with an already-taken email.
        if (!nameMatches || !passMatches) {
          return res.status(409).json({ error: "An account with this email address already exists. Please log in." });
        }
        // If both match, fall through to apply any additional updates below.
      }

      // --- UPDATE LOGIC ---
      const profileUpdates = {};
      if (gender !== undefined) profileUpdates.gender = gender;
      if (age !== undefined) profileUpdates.age = age;
      if (height !== undefined) profileUpdates.height = height;
      if (weight !== undefined) profileUpdates.weight = weight;
      if (place !== undefined) profileUpdates.place = place;
      if (goal !== undefined) profileUpdates.goal = goal;
      if (equipments !== undefined) profileUpdates.equipments = equipments;
      if (profileImage !== undefined) profileUpdates.profileImage = profileImage;

      // If client explicitly provided fullName or password (and they matched existing), keep them as well.
      // This handles the case where the client re-sends the same password/fullName during update.
      if (fullName !== undefined) profileUpdates.fullName = fullName;
      if (password !== undefined) profileUpdates.password = password; // per your request, no hashing

      // Apply updates only if there is something to update
      if (Object.keys(profileUpdates).length > 0) {
        await User.updateOne({ email: sanitizedEmail }, { $set: profileUpdates });
      }

      return res.status(200).json({ message: "Profile updated successfully!", email: sanitizedEmail });
    } else {
      // --- CREATE LOGIC ---
      // The user does not exist, so this is the first step of the signup.
      if (!fullName || (typeof password === 'undefined' || password === null)) {
        return res.status(400).json({ error: "Full name and password are required for new account." });
      }

      const newUser = new User({
        fullName,
        email: sanitizedEmail,
        password, // plain text as requested (not recommended for production)
        gender, age, height, weight, place, equipments, goal, profileImage
      });

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
    if (!sanitizedEmail || (typeof password === 'undefined')) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: sanitizedEmail });
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

// --- Chatbot Route (UNCHANGED) ---
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'No question provided.' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("❌ CRITICAL: OPENROUTER_API_KEY is not set in environment variables.");
    return res.status(500).json({ error: "Server configuration error: AI service is not configured." });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemma-3-27b-it:free",
        messages: [
          { role: "system", content: "You are a friendly and helpful fitness assistant. Provide concise and accurate information about workouts, nutrition, and general health." },
          { role: "user", content: question }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://personalize-fitness-trainer.netlify.app'
        }
      }
    );

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

// --- User Data Routes (UNCHANGED except email sanitization) ---
app.get('/user/:email', async (req, res) => {
  try {
    const rawEmail = req.params.email;
    const sanitizedEmail = sanitizeEmail(decodeURIComponent(rawEmail));
    if (!sanitizedEmail) return res.status(400).json({ error: 'Invalid email parameter.' });

    const user = await User.findOne({ email: sanitizedEmail }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
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
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// --- Notification Routes (UNCHANGED) ---
app.post('/subscribe', async (req, res) => {
  res.status(200).json({ message: 'Subscription endpoint is active.' });
});

app.get('/notifications/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    const notifications = await Notification.find({ recipientEmail: sanitizedEmail }).sort({ timestamp: -1 });
    res.json(notifications);
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

app.post('/notifications/mark-read/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    await Notification.updateMany({ recipientEmail: sanitizedEmail, read: false }, { $set: { read: true } });
    res.status(200).send({ message: 'All notifications marked as read.'});
  } catch (error) {
    console.error("❌ Error marking notifications read:", error);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

app.get('/notifications/unread-count/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    const count = await Notification.countDocuments({ recipientEmail: sanitizedEmail, read: false });
    res.json({ unreadCount: count });
  } catch (error) {
    console.error("❌ Error getting unread count:", error);
    res.status(500).json({ error: 'Failed to get unread count.' });
  }
});

// --- Challenge Routes (UNCHANGED except email sanitization) ---
app.get('/challenges/received/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    const challenges = await Challenge.find({ opponentEmail: sanitizedEmail, status: 'pending' }).sort({ timestamp: -1 });
    res.json(challenges);
  } catch (error) {
    console.error("❌ Error fetching challenges:", error);
    res.status(500).json({ error: 'Failed to fetch challenges.' });
  }
});

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
