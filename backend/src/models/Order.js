import mongoose from "mongoose";
const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [
      {
        menuItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuItem",
          required: true,
        },
        name: String,
        price: Number,
        quantity: { type: Number, min: 1 },
      },
    ],
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["cash", "card"], default: "cash" },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["placed", "preparing", "ready", "completed", "cancelled"],
      default: "placed",
    },
  },
  { timestamps: true },
);
export default mongoose.model("Order", orderSchema);
