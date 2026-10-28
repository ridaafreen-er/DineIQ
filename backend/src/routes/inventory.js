import express from "express";
import Inventory from "../models/Inventory.js";
import { allowRoles, protect } from "../middleware/auth.js";

const router = express.Router();
router.use(protect, allowRoles("admin"));

router.get("/", async (_req, res, next) => {
  try {
    const inventory = await Inventory.find()
      .populate("menuItem", "name category available")
      .sort({ updatedAt: -1 });
    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { currentStock, lowStockThreshold } = req.body;
    const inventory = await Inventory.findByIdAndUpdate(
      req.params.id,
      {
        ...(currentStock !== undefined && {
          currentStock: Number(currentStock),
        }),
        ...(lowStockThreshold !== undefined && {
          lowStockThreshold: Number(lowStockThreshold),
        }),
      },
      { new: true, runValidators: true },
    ).populate("menuItem", "name category available");
    if (!inventory)
      return res.status(404).json({ message: "Inventory item not found." });
    res.json(inventory);
  } catch (error) {
    next(error);
  }
});
export default router;
