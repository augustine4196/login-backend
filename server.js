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

app.use(cors({
  origin: "*",
  methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
}));

app.use(bodyParser.json());


// =================================================================
// --- 3. ALL API ROUTES ---
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

    if (response.data?.choices?.[0]?.message) {
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


// --- User Data Routes ---
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

// =================================================================
// --- ✅ MODIFIED: WORKOUT PLAN GENERATION LOGIC ---
// =================================================================

const masterExercises = [
    // Cardio
    { id: 1, title: "15 min Running", type: "Cardio", requirement: "Treadmill", image: "trend_mill.png", tutorial: "tutorial.html" },
    { id: 2, title: "15 min Elliptical", type: "Cardio", requirement: "Elliptical", image: "Elliptical.jpeg", tutorial: "tutorial.html" },
    { id: 3, title: "20 min Cycling", type: "Cardio", requirement: "Stationary Bike", image: "cycle.jpeg", tutorial: "tutorial.html" },
    { id: 4, title: "10 min Jumping Jacks", type: "Cardio", requirement: "Bodyweight", image: "jumping_jacks.png", tutorial: "tutorial.html" },
    { id: 5, title: "10 min High Knees", type: "Cardio", requirement: "Bodyweight", image: "high_knees.png", tutorial: "tutorial.html" },

    // Strength
    { id: 6, title: "3x10 Bicep Curls", type: "Strength", requirement: "Dumbbells", image: "dumbell.jpeg", tutorial: "bicep_curl_tutorial.html" },
    { id: 7, title: "3x12 Dumbbell Press", type: "Strength", requirement: "Dumbbells", image: "reps.png", tutorial: "tutorial.html" }, // This is the common exercise
    { id: 8, title: "3x8 Pull-ups", type: "Strength", requirement: "Pull-up Bar", image: "Pull-up Bar.png", tutorial: "tutorial.html" },
    { id: 9, title: "3x15 Push-ups", type: "Strength", requirement: "Bodyweight", image: "pushups.png", tutorial: "tutorial.html" },
    { id: 10, title: "3x20 Squats", type: "Strength", requirement: "Bodyweight", image: "squats.png", tutorial: "tutorial.html" },
    { id: 11, title: "3x15 Lunges", type: "Strength", requirement: "Bodyweight", image: "lunges.png", tutorial: "tutorial.html" },
    { id: 12, title: "3x1 min Plank", type: "Strength", requirement: "Bodyweight", image: "plank.png", tutorial: "tutorial.html" },
    
    // Flexibility / Cooldown
    { id: 13, title: "5 min Hamstring Stretch", type: "Cooldown", requirement: "Bodyweight", image: "stretch.png", tutorial: "tutorial.html" },
    { id: 14, title: "5 min Quad Stretch", type: "Cooldown", requirement: "Bodyweight", image: "stretch.png", tutorial: "tutorial.html" },
];

function generateWorkoutPlan(user) {
    const { goal, equipments = [] } = user;
    let plan = [];
    const userEquipments = Array.isArray(equipments) ? equipments : (equipments ? [equipments] : []);
    
    // Filter all exercises the user can possibly do
    const availableExercises = masterExercises.filter(ex => 
        ex.requirement === 'Bodyweight' || userEquipments.includes(ex.requirement)
    );

    // MODIFICATION: Define the common exercise
    const commonRepsExerciseId = 7; // ID for "3x12 Dumbbell Press"
    const commonExercise = masterExercises.find(ex => ex.id === commonRepsExerciseId);
    let selectableExercises = [...availableExercises];

    // MODIFICATION: If the user has dumbbells, add the common exercise first
    if (userEquipments.includes('Dumbbells') && commonExercise) {
        plan.push(commonExercise);
        // Exclude it from the pool of exercises to be randomly selected
        selectableExercises = availableExercises.filter(ex => ex.id !== commonRepsExerciseId);
    }

    // Helper to get random, non-repeating exercises from the remaining pool
    const getRandom = (arr, type, count) => {
        const filtered = arr.filter(ex => ex.type === type);
        return [...filtered].sort(() => 0.5 - Math.random()).slice(0, count);
    };
    
    // Add a warm-up from the selectable exercises
    plan.push(...getRandom(selectableExercises, "Cardio", 1));

    // Generate the main workout based on the user's goal
    switch (goal) {
        case 'loose weight':
            plan.push(...getRandom(selectableExercises, "Cardio", 2));
            plan.push(...getRandom(selectableExercises, "Strength", 2));
            break;
        case 'gain weight':
            plan.push(...getRandom(selectableExercises, "Strength", 4));
            break;
        case 'get fit':
            plan.push(...getRandom(selectableExercises, "Cardio", 2));
            plan.push(...getRandom(selectableExercises, "Strength", 2));
            break;
        case 'body weight':
            const bodyweightOnly = selectableExercises.filter(ex => ex.requirement === 'Bodyweight');
            plan = [ // Reset plan to ensure only bodyweight is included
                ...getRandom(bodyweightOnly, "Cardio", 2),
                ...getRandom(bodyweightOnly, "Strength", 3)
            ];
            break;
        default:
            plan.push(...getRandom(selectableExercises, "Cardio", 2));
            plan.push(...getRandom(selectableExercises, "Strength", 2));
    }
    
    // Add a cooldown
    plan.push(...getRandom(selectableExercises, "Cooldown", 1));

    // Remove duplicates and ensure the final plan has a max of 5 exercises
    const uniquePlan = [...new Map(plan.map(item => [item['id'], item])).values()];
    return uniquePlan.slice(0, 5);
}

app.get('/api/workout-plan/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const workoutPlan = generateWorkoutPlan(user);
        res.status(200).json(workoutPlan);
    } catch (err) {
        console.error("❌ Error generating workout plan:", err);
        res.status(500).json({ error: 'Failed to generate workout plan.' });
    }
});
// =================================================================
// --- END OF MODIFIED CODE ---
// =================================================================

app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

// --- Notification Routes ---
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
        const challengeRooms = {};

        io.on('connection', (socket) => {
            // ... (Your existing socket.io code is unchanged)
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
            
            socket.on('accept-challenge', async ({ challengeId, challengerEmail, challengeRoomId }) => {
                await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
                const challengerSocketId = userSockets[challengerEmail];
                if (challengerSocketId) {
                    io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
                }
                socket.emit('challenge-accepted-redirect', { challengeRoomId });
            });
            
            socket.on('setup-change', ({ roomName, exercise, reps }) => {
                socket.to(roomName).emit('setup-update', { exercise, reps });
            });

            socket.on('start-challenge-now', ({ roomName, exercise, reps }) => {
                io.to(roomName).emit('start-the-challenge', { exercise, reps });
            });

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