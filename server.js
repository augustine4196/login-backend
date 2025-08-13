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
app.use(cors());
app.use(bodyParser.json());

// =================================================================
// --- 3. API ROUTES ---
// =================================================================

app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

app.post('/signup', async (req, res) => {
  // Your full, working signup code...
});

app.post('/login', async (req, res) => {
  // Your full, working login code...
});


// --- THIS IS THE CORRECTED CHATBOT ROUTE ---
app.post('/ask', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "No question provided." });
  }
  
  // Ensure your API key is available
  if (!process.env.OPENROUTER_API_KEY) {
      console.error("❌ OpenRouter Error: API key is not set in environment variables.");
      return res.status(500).json({ error: "The AI service is not configured correctly." });
  }

  try {
    // This is the real call to the external AI service
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct', // A good, free model
        messages: [{ role: 'user', content: question }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://personalize-fitness-trainer.netlify.app/', // Your site
          'X-Title': 'FitnessGuru AI'
        }
      }
    );

    // Extract the actual intelligent response from the AI
    const botReply = response.data.choices[0].message.content;
    res.json({ answer: botReply });

  } catch (error) {
    console.error("❌ OpenRouter API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "The AI assistant failed to respond. Please try again later." });
  }
});
// --- END OF CORRECTION ---


app.get('/admin/users', async (req, res) => {
    // Your full, working user search code...
});

// ... All your other original routes like /subscribe, /notifications etc. are here ...


// =================================================================
// --- 4. SERVER STARTUP AND REAL-TIME INTEGRATION ---
// =================================================================
const PORT = process.env.PORT || 10000;

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB Atlas");

        const server = http.createServer(app);
        const io = new Server(server, { /* ... your socket.io config ... */ });
        const userSockets = {};

        io.on('connection', (socket) => {
            // ... all your socket.io listeners ...
        });

        // This must be defined inside startServer to access `io`
        app.post('/send-challenge', async (req, res) => {
            // ... your full, working send-challenge code ...
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