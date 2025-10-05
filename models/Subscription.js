const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    razorpayOrderId: {
        type: String,
        required: true,
    },
    razorpayPaymentId: {
        type: String,
        required: true,
    },
    razorpaySignature: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['created', 'paid', 'failed'],
        default: 'created',
    },
    plan: {
        type: String,
        default: 'Premium Plan',
    },
    amount: {
        type: Number, // Stored in paise (e.g., 19900 for ₹199)
        required: true,
    },
    paidAt: {
        type: Date,
    },
}, { timestamps: true }); // `timestamps` adds createdAt and updatedAt fields

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;