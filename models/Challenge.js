// models/Challenge.js
const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
    challengerEmail: { type: String, required: true },
    challengerName: { type: String, required: true },
    opponentEmail: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'declined', 'active', 'completed'], 
        default: 'pending' 
    },
    challengeRoomId: { type: String, required: true, unique: true },
    winnerEmail: String,
    exercise: { type: String, default: '20 Pushups' },
    timestamp: { type: Date, default: Date.now }
});

const Challenge = mongoose.model('Challenge', challengeSchema);

module.exports = Challenge;