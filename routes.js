const express = require('express');
const router = express.Router();
const Profile = require('../models/Profile');

// POST /profile - Save or update user profile
router.post('/', async (req, res) => {
  const { email, age, height, weight, gender, goal, equipment } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    let profile = await Profile.findOne({ email });

    if (profile) {
      // Update existing
      profile.age = age;
      profile.height = height;
      profile.weight = weight;
      profile.gender = gender;
      profile.goal = goal;
      profile.equipment = equipment;
      await profile.save();
    } else {
      // Create new
      profile = new Profile({ email, age, height, weight, gender, goal, equipment });
      await profile.save();
    }

    res.json({ message: "Profile saved successfully" });

  } catch (err) {
    console.error("Profile saving failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
