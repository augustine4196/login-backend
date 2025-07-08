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

app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.log("❌ MongoDB Atlas connection error:", err));

// 🟢 Signup Route
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

// 🟢 Login Route
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

// ✅ Chat Route Using Nutritionix API
app.post('/ask', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "No question provided." });
  }

  try {
    const response = await axios({
      method: 'POST',
      url: 'https://trackapi.nutritionix.com/v2/natural/nutrients',
      headers: {
        'x-app-id': process.env.NUTRITIONIX_APP_ID,
        'x-app-key': process.env.NUTRITIONIX_API_KEY,
        'Content-Type': 'application/json'
      },
      data: { query: question }
    });

    const foodData = response.data.foods.map(food => {
      return `${food.food_name} - ${food.nf_calories} calories, ${food.nf_protein}g protein, ${food.serving_qty} ${food.serving_unit}`;
    }).join('\n');

    res.json({ answer: foodData });
  } catch (error) {
    console.error("Nutritionix Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Could not fetch nutrition data." });
  }
});

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
