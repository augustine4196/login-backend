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

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Test route
app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

// ✅ Signup route
app.post('/signup', async (req, res) => {
  const {
    fullName,
    email,
    password,
    gender,
    age,
    height,
    weight,
    place,
    equipments,
    goal
  } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const newUser = new User({
      fullName,
      email,
      password,
      gender,
      age,
      height,
      weight,
      place,
      equipments,
      goal
    });

    await newUser.save();
    res.status(200).json({ message: "Account created successfully!" });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

// ✅ Login route
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
      email: user.email
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
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

// ✅ Profile update route
app.post("/profile", async (req, res) => {
  const { email, goal } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Missing email." });
  }
  if (!goal) {
    return res.status(400).json({ message: "Missing goal." });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if any field is missing before updating
    const missingFields = [];
    if (!user.fullName) missingFields.push("fullName");
    if (!user.password) missingFields.push("password");
    if (!user.gender) missingFields.push("gender");
    if (!user.age) missingFields.push("age");
    if (!user.height) missingFields.push("height");
    if (!user.weight) missingFields.push("weight");
    if (!user.place) missingFields.push("place");
    if (!user.equipments) missingFields.push("equipments");

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing fields: ${missingFields.join(", ")}. Please go through the signup steps.`,
      });
    }

    user.goal = goal;
    await user.save();

    res.json({ message: "Goal saved successfully!", user });
  } catch (error) {
    console.error("Error updating goal:", error);
    res.status(500).json({ message: "Server error while saving goal." });
  }
});


// ✅ Get all users (admin)
app.get('/admin/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
