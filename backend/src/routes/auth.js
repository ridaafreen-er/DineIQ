import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";
const router = express.Router();
const tokenFor = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
const payload = (user) => ({
  token: tokenFor(user),
  user: { id: user._id, name: user.name, email: user.email, role: user.role },
});
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ message: "Name, email, and password are required." });
    if (await User.exists({ email: email.toLowerCase() }))
      return res
        .status(409)
        .json({ message: "An account with that email already exists." });
    res.status(201).json(payload(await User.create({ name, email, password })));
  } catch (e) {
    next(e);
  }
});
router.post("/login", async (req, res, next) => {
  try {
    const user = await User.findOne({
      email: req.body.email?.toLowerCase(),
    }).select("+password");
    if (!user || !(await user.comparePassword(req.body.password || "")))
      return res.status(401).json({ message: "Incorrect email or password." });
    res.json(payload(user));
  } catch (e) {
    next(e);
  }
});
router.get("/me", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});
export default router;
