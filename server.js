// =================================================================
// --- 1. IMPORTS ---
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
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
const server = http.createServer(app); // Create the HTTP server from Express
const io = new Server(server, { // Attach Socket.IO to the server immediately
    cors: { origin: "*" },
    pingInterval: 20000,
    pingTimeout: 5000,
});
app.use(cors());
app.use(bodyParser.json()); // Your original, working parser

// This object will track online users
const userSockets = {};

// =================================================================
// --- 3. REAL-TIME EVENT LISTENERS (SOCKET.IO) ---
// This section handles direct WebSocket communication.
// =================================================================
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
    
    // All other socket listeners (accept-challenge, webrtc, game-sync)
    // ...
});


// =================================================================
// --- 4. API ROUTES (EXPRESS) ---
// ALL your original routes, including the chatbot, are here and untouched.
// =================================================================

app.get("/", (req, res) => res.send("✅ FitFlow backend is working!"));

app.post('/signup', async (req, res) => { /* ...your full, original signup code... */ });
app.post('/login', async (req, res) => { /* ...your full, original login code... */ });

// YOUR CHATBOT ROUTE - RESTORED TO ITS CORRECT POSITION
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
          'HTTP-Referer': 'https://fitflow.netlify.app/', // You might want to add your other domain here
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

app.get('/user/:email', async (req, res) => { /* ...your full, original user code... */ });
app.get('/admin/users', async (req, res) => { /* ...your full, original admin users code... */ });
app.post('/subscribe', async (req, res) => { /* ...your full, original subscribe code... */ });
app.get('/notifications/:email', async (req, res) => { /* ...your full, original notifications code... */ });
app.post('/notifications/mark-read/:email', async (req, res) => { /* ...your full, original mark-read code... */ });
app.get('/notifications/unread-count/:email', async (req, res) => { /* ...your full, original unread-count code... */ });

// --- New and Modified Routes for Challenges ---
app.get('/challenges/received/:email', async (req, res) => { /* ...your challenges code... */ });

// This route uses the `io` and `userSockets` variables defined in the higher scope.
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

// =================================================================
// --- 5. SERVER STARTUP ---
// =================================================================
const PORT = process.env.PORT || 10000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    
    // Use `server.listen` because our server is the `http` instance which handles both protocols.
    server.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error: Could not start server.", err);
    process.exit(1);
  });