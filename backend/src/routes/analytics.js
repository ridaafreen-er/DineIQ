import express from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Order from "../models/Order.js";
import Inventory from "../models/Inventory.js";
import Feedback from "../models/Feedback.js";
import MenuItem from "../models/MenuItem.js";
import { allowRoles, protect } from "../middleware/auth.js";
const router = express.Router();
router.use(protect, allowRoles("admin"));
router.get("/overview", async (_req, res, next) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [today, topItems, lowStock, feedback, sentiments] = await Promise.all([
      Order.aggregate([
        {
          $match: { createdAt: { $gte: start }, status: { $ne: "cancelled" } },
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$total" },
          },
        },
      ]),
      Order.aggregate([
        { $unwind: "$items" },
        { $match: { status: { $ne: "cancelled" } } },
        {
          $group: { _id: "$items.name", ordered: { $sum: "$items.quantity" } },
        },
        { $sort: { ordered: -1 } },
        { $limit: 5 },
      ]),
      Inventory.find({
        $expr: { $lte: ["$currentStock", "$lowStockThreshold"] },
      }).populate("menuItem", "name"),
      Feedback.aggregate([
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]),
      Feedback.aggregate([
        { $group: { _id: "$sentiment", count: { $sum: 1 } } },
      ]),
    ]);
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    sentiments.forEach(({ _id, count }) => {
      sentimentCounts[_id] = count;
    });
    res.json({
      today: today[0] || { orders: 0, revenue: 0 },
      topItems,
      lowStock,
      feedback: {
        ...(feedback[0] || { averageRating: 0, count: 0 }),
        sentiments: sentimentCounts,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/demand-forecast", async (_req, res, next) => {
  try {
    const orders = await Order.find({ status: "completed" }).lean();
    const menuItems = await MenuItem.find().lean();
    const itemCategoryMap = {};
    menuItems.forEach((m) => {
      itemCategoryMap[String(m._id)] = m.category;
      itemCategoryMap[m.name] = m.category;
    });

    const payload = JSON.stringify({ orders, itemCategoryMap });

    const scriptCandidates = [
      path.resolve(process.cwd(), "ml/demand_forecast.py"),
      path.resolve(process.cwd(), "../ml/demand_forecast.py"),
    ];
    const scriptPath = scriptCandidates.find((candidate) => fs.existsSync(candidate));
    if (!scriptPath) {
      return res.status(503).json({ message: "Demand forecast script is unavailable." });
    }

    const pythonCandidates = [
      path.resolve(process.cwd(), ".venv/Scripts/python.exe"),
      path.resolve(process.cwd(), "../.venv/Scripts/python.exe"),
      path.resolve(process.cwd(), ".venv/bin/python"),
      path.resolve(process.cwd(), "../.venv/bin/python"),
      "python",
    ];
    const pythonBin = pythonCandidates.find(
      (candidate) => candidate === "python" || fs.existsSync(candidate),
    );
    const forecastProcess = spawn(pythonBin, [scriptPath, "--stdin"], {
      env: process.env,
    });

    let stdout = "";
    forecastProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    forecastProcess.on("error", () => {
      if (!res.headersSent) {
        res.status(503).json({ message: "Demand forecast could not be generated." });
      }
    });
    forecastProcess.on("close", (code) => {
      if (res.headersSent) return;
      if (code !== 0 || !stdout.trim()) {
        return res.status(503).json({ message: "Demand forecast could not be generated." });
      }
      try {
        res.json(JSON.parse(stdout));
      } catch {
        res.status(503).json({ message: "Demand forecast returned invalid data." });
      }
    });
    forecastProcess.stdin.end(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
