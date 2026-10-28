import mongoose from "mongoose";
const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: "" },
    available: { type: Boolean, default: true },
    vegetarian: { type: Boolean, default: false },
    prepMinutes: { type: Number, default: 15, min: 1 },
  },
  { timestamps: true },
);
export default mongoose.model("MenuItem", menuItemSchema);
