import express from "express";
import Order from "../models/Order.js";
import MenuItem from "../models/MenuItem.js";
import { allowRoles, protect } from "../middleware/auth.js";
const router = express.Router();
router.post("/", protect, async (req, res, next) => {
  try {
    const { items, paymentMethod = "cash" } = req.body;
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ message: "Your cart is empty." });
    const ids = items.map((item) => item.menuItem);
    const menu = await MenuItem.find({ _id: { $in: ids }, available: true });
    if (menu.length !== ids.length)
      return res
        .status(400)
        .json({ message: "One or more menu items are no longer available." });
    const byId = new Map(menu.map((item) => [String(item._id), item]));
    const orderItems = items.map(({ menuItem, quantity }) => {
      const item = byId.get(String(menuItem));
      const count = Math.max(1, Number(quantity) || 1);
      return {
        menuItem: item._id,
        name: item.name,
        price: item.price,
        quantity: count,
      };
    });
    const total = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      total,
      paymentMethod,
      paymentStatus: paymentMethod === "card" ? "paid" : "pending",
    });
    res.status(201).json(order);
  } catch (e) {
    next(e);
  }
});
router.get("/mine", protect, async (req, res, next) => {
  try {
    res.json(await Order.find({ user: req.user.id }).sort({ createdAt: -1 }));
  } catch (e) {
    next(e);
  }
});
router.get(
  "/active",
  protect,
  allowRoles("kitchen", "admin"),
  async (_req, res, next) => {
    try {
      res.json(
        await Order.find({ status: { $in: ["placed", "preparing", "ready"] } })
          .populate("user", "name")
          .sort({ createdAt: 1 }),
      );
    } catch (error) {
      next(error);
    }
  },
);
router.get("/:id", protect, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (
      String(order.user._id || order.user) !== req.user.id &&
      !["kitchen", "admin"].includes(req.user.role)
    ) {
      return res.status(403).json({ message: "Access denied." });
    }
    res.json(order);
  } catch (e) {
    next(e);
  }
});
router.patch(
  "/:id/status",
  protect,
  allowRoles("kitchen", "admin"),
  async (req, res, next) => {
    try {
      const allowed = [
        "placed",
        "preparing",
        "ready",
        "completed",
        "cancelled",
      ];
      if (!allowed.includes(req.body.status))
        return res.status(400).json({ message: "Invalid order status." });
      const order = await Order.findByIdAndUpdate(
        req.params.id,
        { status: req.body.status },
        { new: true },
      ).populate("user", "name");
      if (!order) return res.status(404).json({ message: "Order not found." });
      res.json(order);
    } catch (error) {
      next(error);
    }
  },
);
export default router;
