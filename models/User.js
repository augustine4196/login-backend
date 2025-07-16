const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email:    { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gender:   { type: String },
    age:      { type: Number },
    height:   { type: Number },
    weight:   { type: Number },
    place:    { type: String },
    equipments: { type: String },
    goal:     { type: String }
});

module.exports = mongoose.model('User', UserSchema);
