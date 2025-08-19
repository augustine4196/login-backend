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
// --- 3. ALL API ROUTES (CHATBOT LOGIC IS NOW FIXED) ---
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

// --- Chatbot Route (MODIFIED) ---
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'No question provided.' });
  }
  try {
    // Convert the user's question to lowercase for easier keyword matching
    const lowerCaseQuestion = question.toLowerCase();
    let botResponse = "I'm sorry, I'm not sure how to answer that. Try asking about workouts, nutrition, or building muscle!";

    // --- Simple Keyword-Based AI Logic ---
    if (lowerCaseQuestion.includes('hello') || lowerCaseQuestion.includes('hi')) {
        botResponse = "Hello! How can I help you with your fitness goals today?";
    } else if (lowerCaseQuestion.includes('how are you')) {
        botResponse = "I'm just a program, but I'm ready to assist you! What's on your mind?";
    } else if (lowerCaseQuestion.includes('workout') || lowerCaseQuestion.includes('exercise')) {
        botResponse = "For a great full-body workout, try combining squats, push-ups, and planks. What muscle group are you targeting?";
    } else if (lowerCaseQuestion.includes('build muscle')) {
        botResponse = "To build muscle, focus on progressive overload (lifting heavier over time) and ensure you're eating enough protein. Aim for 1.6-2.2 grams of protein per kg of body weight.";
    } else if (lowerCaseQuestion.includes('lose weight') || lowerCaseQuestion.includes('fat loss')) {
        botResponse = "Weight loss is primarily about maintaining a consistent calorie deficit. Combining a healthy diet with regular cardiovascular exercise like running or cycling is very effective.";
    } else if (lowerCaseQuestion.includes('nutrition') || lowerCaseQuestion.includes('what should i eat')) {
        botResponse = "A balanced diet is key. Make sure to include lean proteins, complex carbohydrates, healthy fats, and plenty of vegetables in your meals.";
    } else if (lowerCaseQuestion.includes('protein')) {
        botResponse = "Excellent sources of protein include chicken breast, fish, eggs, tofu, lentils, and Greek yogurt. They are essential for muscle repair and growth.";
    } else if (lowerCaseQuestion.includes('thank you') || lowerCaseQuestion.includes('thanks')) {
        botResponse = "You're welcome! Let me know if you have any other questions.";
    }
    
    // Send the determined response
    res.status(200).json({ answer: botResponse });

  } catch (error) {
    console.error("❌ Error in /ask route:", error);
    res.status(500).json({ error: "Something went wrong while processing your question." });
  }
});

// --- User Data Routes (UNCHANGED) ---
app.get('/user/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email }).select('-password');
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
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

// --- Notification Routes (UNCHANGED) ---
app.post('/subscribe', async (req, res) => {
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

// --- Challenge Routes (UNCHANGED) ---
app.get('/challenges/received/:email', async (req, res) => {
    try {
        const challenges = await Challenge.find({ opponentEmail: req.params.email, status: 'pending' }).sort({ timestamp: -1 });
        res.json(challenges);
    } catch (error) {
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