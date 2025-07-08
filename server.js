const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const User = require('./models/User');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Test route
app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.log("❌ MongoDB Atlas connection error:", err));

// ✅ Signup route
app.post('/signup', async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const newUser = new User({ fullName, email, password });
    await newUser.save();
    res.status(200).json({ message: "Account created successfully!" });

  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Server error during signup." });
  }
});

// ✅ Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    if (String(user.password) !== String(password)) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    return res.status(200).json({
      message: "Login successful!",
      fullName: user.fullName
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// ✅ Chatbot route using OpenRouter
app.post('/ask', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "No question provided." });
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct',  // ✅ Working free model
        messages: [{ role: 'user', content: question }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fitflow.netlify.app/',  // ✅ your frontend domain
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


// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
