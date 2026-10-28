import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
      unique: true,
    },
    currentStock: { type: Number, required: true, min: 0, default: 25 },
    lowStockThreshold: { type: Number, required: true, min: 0, default: 5 },
  },
  { timestamps: true },
);

export default mongoose.model("Inventory", inventorySchema);
