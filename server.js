const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const User = require('./models/User');

const app = express();

// === Middlewares ===
app.use(cors());
app.use(bodyParser.json());

// === Connect to MongoDB ===
mongoose.connect('mongodb://localhost:27017/loginDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ MongoDB connection error:", err));

// === Signup Route ===
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
        console.error("Signup error:", err);
        res.status(500).json({ error: "Server error during signup." });
    }
});

// === Login Route ===
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  console.log("🔐 Login attempt with:", { email, password });

  try {
    const user = await User.findOne({ email });

    if (!user) {
      console.warn("⚠️ User not found with email:", email);
      return res.status(401).json({ error: "User not found." });
    }

    console.log("✅ User found:", user);

    if (String(user.password) !== String(password)) {
      console.warn("❌ Incorrect password for:", email);
      return res.status(401).json({ error: "Incorrect password." });
    }

    console.log("🎉 Login successful for:", email);

    return res.status(200).json({
      message: "Login successful!",
      fullName: user.fullName
    });

  } catch (err) {
    console.error("🔥 Server error during login:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// === Start Server ===
app.listen(5000, () => {
    console.log('🚀 Server running at http://localhost:5000');
});
