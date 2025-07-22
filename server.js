const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const User = require('./models/User');
const webpush = require('web-push');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Root test route
app.get("/", (req, res) => {
  res.send("✅ FitFlow backend is working!");
});

// ✅ Signup route
app.post('/signup', async (req, res) => {
  const {
    fullName, email, password, gender, age, height, weight, place,
    equipments, goal, profileImage
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

    const newUser = new User({
      fullName, email: sanitizedEmail, password, gender, age, height,
      weight, place, equipments, goal, profileImage
    });

    await newUser.save();
    res.status(201).json({ message: "Account created successfully!" });

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
      email: user.email,
      profileImage: user.profileImage || null
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ✅ GET user by email (used in search bar)
app.get('/user/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({
      fullName: user.fullName,
      email: user.email,
      profileImage: user.profileImage || null
    });

  } catch (err) {
    console.error("❌ Error in /user/:email", err);
    res.status(500).json({ message: "Server error." });
  }
});

// ✅ Chatbot route
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

// ✅ Profile update
app.post("/profile", async (req, res) => {
  try {
    const {
      fullName, email, password, gender, age, height, weight,
      place, goal, equipments
    } = req.body;

    if (!email || !goal) {
      return res.status(400).json({ message: "Email and goal are required." });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const requiredFields = { fullName, password, gender, age, height, weight, place, goal };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, v]) => !v || v === "null" || v === "undefined")
      .map(([k]) => k);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing fields: ${missingFields.join(", ")}.`
      });
    }

    Object.assign(user, {
      fullName, password, gender, age, height, weight, place, goal, equipments
    });

    await user.save();
    res.json({ message: "✅ Profile saved successfully!", user });

  } catch (error) {
    console.error("❌ Error in /profile:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// ✅ Upload profile image
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

    res.status(200).json({ message: "✅ Profile image saved." });
  } catch (err) {
    console.error("❌ Error saving profile image:", err);
    res.status(500).json({ error: "Image save failed." });
  }
});

// ✅ Admin: get all users
app.get('/admin/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ✅ Setup push notifications
webpush.setVapidDetails(
  'mailto:your@email.com',
  'BJgQO8CvRLdcGr5LFA9qisfTLG8FwdvMLOFPaqX4rGi4bGSmOL-0RHKaWkuQg5GEyMDCfhEOuDxr2z1PwPg_2zM',
  'WbSlhUVA7xQImHjp00hxSA14t0V7l0cl7p7hCqPOpMA'
);

// ✅ Save subscription
app.post('/subscribe', async (req, res) => {
  const { email, subscription } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.subscription = subscription;
    await user.save();

    res.status(201).json({ message: 'Subscription saved successfully.' });
  } catch (err) {
    console.error("❌ Error saving subscription:", err);
    res.status(500).json({ error: 'Failed to save subscription.' });
  }
});

// ✅ SEND CHALLENGE ROUTE — updated
app.post('/send-challenge', async (req, res) => {
  const { fromName, toEmail } = req.body;

  try {
    const recipient = await User.findOne({ email: toEmail });
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found.' });
    }

    if (!recipient.subscription) {
      return res.status(400).json({ error: 'Recipient has not subscribed to notifications.' });
    }

    const payload = JSON.stringify({
      title: 'New Challenge Received',
      message: `${fromName} has challenged you on FitFlow! 💪`
    });

    await webpush.sendNotification(recipient.subscription, payload);
    res.status(200).json({ message: 'Challenge sent successfully.' });

  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send challenge notification.' });
  }
});

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
