import express from "express";
import Feedback from "../models/Feedback.js";
import Order from "../models/Order.js";
import { allowRoles, protect } from "../middleware/auth.js";

const router = express.Router();
const classify = (rating, comment = "") => {
  const text = (comment || "").toLowerCase().trim();

  // Normalized rating score: 5->+2, 4->+1, 3->0, 2->-1, 1->-2
  const ratingScore = Number(rating) >= 1 && Number(rating) <= 5 ? Number(rating) - 3 : 0;

  if (!text) {
    if (ratingScore > 0) return "positive";
    if (ratingScore < 0) return "negative";
    return "neutral";
  }

  // Negation words
  const negations = ["not", "never", "no", "hardly", "barely", "wasn't", "isnt", "isn't", "didn't", "dont", "don't"];
  const positiveWords = ["great", "good", "love", "loved", "excellent", "amazing", "fresh", "delicious", "tasty", "fast", "quick", "hot", "perfect", "friendly", "superb", "best", "yummy", "crispy"];
  const negativeWords = ["bad", "cold", "late", "poor", "worst", "disappoint", "disappointed", "slow", "terrible", "horrible", "awful", "stale", "bland", "salty", "greasy", "undercooked", "overcooked", "missing"];

  let textScore = 0;
  const words = text.replace(/[^a-z0-9'\s]/g, " ").split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = i > 0 ? words[i - 1] : "";
    const isNegated = negations.includes(prevWord);

    if (positiveWords.some((pw) => word.includes(pw))) {
      textScore += isNegated ? -1.5 : 1.0;
    } else if (negativeWords.some((nw) => word.includes(nw))) {
      textScore += isNegated ? 0.5 : -1.5;
    }
  }

  // Handle severe negative feedback override
  const hasStrongNegative = negativeWords.some((nw) => text.includes(nw));
  if (hasStrongNegative && ratingScore <= 0) {
    return "negative";
  }

  // Contradiction: 5 stars but explicitly negative comment
  if (ratingScore === 2 && textScore <= -1.5) {
    return "neutral"; // Flags contradictory review
  }

  const combinedScore = ratingScore * 1.2 + textScore;

  if (combinedScore >= 0.8) return "positive";
  if (combinedScore <= -0.8) return "negative";
  return "neutral";
};
router.post("/", protect, async (req, res, next) => {
  try {
    const { order: orderId, rating, comment = "" } = req.body;
    const order = await Order.findOne({ _id: orderId, user: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.status !== "completed")
      return res
        .status(400)
        .json({
          message: "Feedback is available after an order is completed.",
        });
    const feedback = await Feedback.create({
      user: req.user.id,
      order: orderId,
      rating,
      comment,
      sentiment: classify(Number(rating), comment),
    });
    res.status(201).json(feedback);
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({ message: "You have already reviewed this order." });
    next(error);
  }
});
router.get("/", protect, allowRoles("admin"), async (_req, res, next) => {
  try {
    res.json(
      await Feedback.find()
        .populate("user", "name")
        .populate("order", "status total")
        .sort({ createdAt: -1 }),
    );
  } catch (error) {
    next(error);
  }
});
export default router;
