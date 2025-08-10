//-- Your original imports
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

//-- NEW: Add these two required modules for real-time functionality
const http = require('http');
const { Server } = require("socket.io");

//-- Your original model imports
const User = require('./models/User');
const webpush = require('web-push');
const Notification = require('./models/Notification');
//-- NEW: Add the new Challenge model. Make sure the file 'models/Challenge.js' exists.
const Challenge = require('./models/Challenge');

const app = express();

//-- MODIFICATION: Create an HTTP server from your Express app.
//-- This is required for Socket.IO and will NOT break your existing API routes.
const server = http.createServer(app);

//-- NEW: Initialize Socket.IO and attach it to the server.
const io = new Server(server, {
  cors: {
    // Allows requests from both your Netlify domains to prevent CORS errors.
    origin: ["https://personalize-fitness-trainer.netlify.app", "https://fitflow.netlify.app"],
    methods: ["GET", "POST"]
  }
});


//-- Your original middleware setup
//-- MODIFICATION: Making the CORS configuration more specific and secure.
app.use(cors({
    origin: ["https://personalize-fitness-trainer.netlify.app", "https://fitflow.netlify.app"]
}));
app.use(bodyParser.json());


//-- NEW: This block contains all the new real-time logic. It is completely separate.
//-- =================================================================
//--               REAL-TIME CHALLENGE LOGIC
//-- =================================================================
const userSockets = {}; // In-memory object to map user emails to socket IDs

io.on('connection', (socket) => {
    console.log(`✅ WebSocket User connected: ${socket.id}`);

    // When a user logs in, they should register their socket
    socket.on('register', (userEmail) => {
        if (userEmail) {
            console.log(`User '${userEmail}' registered with socket ${socket.id}`);
            userSockets[userEmail] = socket.id;
        }
    });

    // When a user accepts a challenge from the notification page
    socket.on('accept-challenge', async ({ challengeId, challengerEmail, opponentEmail, challengeRoomId }) => {
        await Challenge.findByIdAndUpdate(challengeId, { status: 'accepted' });
        const challengerSocketId = userSockets[challengerEmail];
        
        // Notify BOTH users to redirect to the video challenge room
        if (challengerSocketId) {
            io.to(challengerSocketId).emit('challenge-accepted-redirect', { challengeRoomId });
        }
        socket.emit('challenge-accepted-redirect', { challengeRoomId });
    });

    // --- WebRTC Signaling Events ---
    socket.on('join-challenge-room', (roomName) => {
        socket.join(roomName);
        socket.to(roomName).emit('peer-joined');
    });
    socket.on('webrtc-offer', (data) => socket.to(data.roomName).emit('webrtc-offer', data.sdp));
    socket.on('webrtc-answer', (data) => socket.to(data.roomName).emit('webrtc-answer', data.sdp));
    socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomName).emit('webrtc-ice-candidate', data.candidate));

    // --- Game Logic Events ---
    socket.on('challenge-start', async (roomName) => {
        await Challenge.findOneAndUpdate({ challengeRoomId: roomName }, { status: 'active' });
        io.to(roomName).emit('challenge-started');
    });
    socket.on('challenge-finish', async ({ roomName, userEmail }) => {
        const challenge = await Challenge.findOne({ challengeRoomId: roomName });
        if (challenge && challenge.status === 'active') {
            await Challenge.updateOne({ _id: challenge._id }, { status: 'completed', winnerEmail: userEmail });
            io.to(roomName).emit('winner-declared', { winnerEmail: userEmail });
        }
    });

    // Clean up when a user disconnects
    socket.on('disconnect', () => {
        console.log(`❌ WebSocket User disconnected: ${socket.id}`);
        for (const email in userSockets) {
            if (userSockets[email] === socket.id) {
                delete userSockets[email];
                break;
            }
        }
    });
});
//-- =================================================================
//--               END OF REAL-TIME LOGIC
//-- =================================================================


// --- ALL YOUR ORIGINAL API ROUTES ARE UNTOUCHED BELOW THIS LINE ---
// This guarantees your login, signup, etc., continue to work exactly as before.

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

app.post('/ask', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "No question provided." });
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct',
        messages: [{ role: 'user', content: question }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fitflow.netlify.app/',
          'X-Title': 'FitFlow Chat'
        }
      }
    );

    const botReply = response.data.choices[0].message.content;
    res.json({ answer: botReply });

  } catch (error) {
    console.error("❌ OpenRouter Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Chatbot failed to respond." });
  }
});

app.get('/user/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user) { return res.status(404).json({ message: "User not found." }); }
    res.json({ fullName: user.fullName, email: user.email, profileImage: user.profileImage || null });
  } catch (err) {
    res.status(500).json({ message: "Server error." });
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

webpush.setVapidDetails(
  'mailto:your@email.com',
  'BJgQO8CvRLdcGr5LFA9qisfTLG8FwdvMLOFPaqX4rGi4bGSmOL-0RHKaWkuQg5GEyMDCfhEOuDxr2z1PwPg_2zM',
  'WbSlhUVA7xQImHjp00hxSA14t0V7l0cl7p7hCqPOpMA'
);

app.post('/subscribe', async (req, res) => {
    const { email, subscription } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        user.subscription = subscription;
        await user.save();
        res.status(201).json({ message: 'Subscription saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save subscription.' });
    }
});

app.get('/notifications/:email', async (req, res) => {
    try {
        const notifications = await Notification.find({ userEmail: req.params.email }).sort({ timestamp: -1 });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});

app.post('/notifications/mark-read/:email', async (req, res) => {
    try {
        await Notification.updateMany({ userEmail: req.params.email, isRead: false }, { $set: { isRead: true } });
        res.json({ message: 'All notifications marked as read.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notifications as read.' });
    }
});

app.get('/notifications/unread-count/:email', async (req, res) => {
    try {
        const userEmail = req.params.email;
        const count = await Notification.countDocuments({
            userEmail: userEmail,
            isRead: false 
        });
        res.status(200).json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch unread count.' });
    }
});


// --- MODIFIED & NEW ROUTES FOR THE CHALLENGE FEATURE ---

//-- MODIFIED: Your /send-challenge route is upgraded to use the new system.
app.post('/send-challenge', async (req, res) => {
  const { fromName, fromEmail, toEmail } = req.body; // Added fromEmail
  try {
    const opponent = await User.findOne({ email: toEmail });
    if (!opponent) return res.status(404).json({ error: 'Recipient not found.' });

    const challengeRoomId = `challenge_${new Date().getTime()}`;
    const newChallenge = new Challenge({
        challengerName: fromName,
        challengerEmail: fromEmail,
        opponentEmail: toEmail,
        challengeRoomId: challengeRoomId
    });
    await newChallenge.save();
    console.log(`📝 Challenge created in DB for room: ${challengeRoomId}`);

    const opponentSocketId = userSockets[toEmail];
    if (opponentSocketId) {
        io.to(opponentSocketId).emit('new-challenge', newChallenge);
        console.log(` Emitted 'new-challenge' to ${toEmail}`);
    } else if (opponent.subscription) {
      const payload = JSON.stringify({ title: 'New Challenge Received', message: `${fromName} has challenged you!` });
      webpush.sendNotification(opponent.subscription, payload).catch(err => console.error("Push notification failed", err));
      console.log(" PUSH notification sent as fallback.");
    }
    res.status(200).json({ message: 'Challenge sent successfully.' });
  } catch (error) {
    console.error('❌ Error in /send-challenge:', error);
    res.status(500).json({ error: 'Failed to send challenge.' });
  }
});

//-- NEW: A new route specifically for fetching pending challenges.
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
    
    //-- MODIFICATION: Use `server.listen` instead of `app.listen`.
    //-- This is the final crucial change that enables the server to handle
    //-- both regular HTTP requests (your login) and WebSocket connections (real-time).
    server.listen(PORT, () => {
      console.log(`🚀 Server with Real-Time support running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });