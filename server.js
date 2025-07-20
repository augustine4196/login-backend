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

// In server.js

// ✅ UPDATED Signup route - now accepts everything at once
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
    goal,
    profileImage // Accept the new field
  } = req.body;

  try {
    const sanitizedEmail = email.toLowerCase().trim();

    if (!fullName || !sanitizedEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const existingUser = await User.findOne({ email: sanitizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    // ✅ THE FIX: Create the complete user object in one go.
    const newUser = new User({
      fullName,
      email: sanitizedEmail,
      password, // In a real app, hash this!
      gender,
      age,
      height,
      weight,
      place,
      equipments,
      goal,
      profileImage // Save the profile image URL
    });

    await newUser.save();
    res.status(201).json({ message: "Account created successfully!" }); // 201 = Created

  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

// The old /profile and /upload-profile-image routes are no longer needed for the signup flow.
// You can keep them for users who want to EDIT their profile later.
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
      email: user.email,
      profileImage: user.profileImage || null
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
  try {
    const {
      fullName,
      email,
      password,
      gender,
      age,
      height,
      weight,
      place,
      goal,
      equipments
    } = req.body;

    console.log("📥 Received profile data:", req.body);

    if (!email) {
      return res.status(400).json({ message: "Missing email. Please go back to signup." });
    }

    if (!goal) {
      return res.status(400).json({ message: "Missing goal. Please select a goal on the goal page." });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found. Please register again." });
    }

    const requiredFields = { fullName, password, gender, age, height, weight, place, goal };
    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value || value === "null" || value === "undefined")
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing fields in request: ${missingFields.join(", ")}. These must be completed in the signup flow.`
      });
    }

    user.fullName = fullName;
    user.password = password;
    user.gender = gender;
    user.age = age;
    user.height = height;
    user.weight = weight;
    user.place = place;
    user.goal = goal;

    if (equipments) {
      user.equipments = equipments;
    }

    await user.save();
    res.json({ message: "✅ Profile and goal saved successfully!", user });

  } catch (error) {
    console.error("❌ Error in /profile:", error);
    res.status(500).json({ message: "Server error while saving profile. Please try again later." });
  }
});

// ✅ Save Cloudinary image URL for user
app.post('/upload-profile-image', async (req, res) => {
  try {
    const { email, imageUrl } = req.body;

    if (!email || !imageUrl) {
      return res.status(400).json({ error: "Missing email or imageUrl." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    user.profileImage = imageUrl;
    await user.save();

    res.status(200).json({ message: "✅ Profile image saved successfully." });
  } catch (err) {
    console.error("❌ Error saving profile image:", err);
    res.status(500).json({ error: "Failed to save profile image." });
  }
});

// ✅ Admin route to get all users
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
