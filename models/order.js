const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const orderSchema = new Schema({
    products: [
        {
            product: {
                type: Object,
                required: true,
            },
            quantity: {
                type: Number,
                required: true,
            },
        },
    ],
    user: {
        email: {
            type: String,
            required: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "User",
        },
        address: {
            line1: {
                type: String,
                required: true,
            },
            city: {
                type: String,
                required: true,
            },
            state: {
                type: String,
                required: true,
            },
            postal_code: {
                type: String,
                required: true,
            },
            country: {
                type: String,
                required: true,
            },
            line2: {
                type: String,
                required: false, // optional (e.g., Apartment/Suite/etc.)
            },
        },
    },
});

module.exports = mongoose.model("Order", orderSchema);
