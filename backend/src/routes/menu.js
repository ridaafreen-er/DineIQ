import express from "express";
import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import {
  allowRoles,
  optionalProtect,
  protect,
} from "../middleware/auth.js";

const router = express.Router();
const COMPLEMENTS_MAP = {
  Pizza: ["Sides", "Drinks", "Desserts"],
  Burgers: ["Sides", "Drinks", "Desserts"],
  Sides: ["Drinks", "Burgers", "Pizza"],
  Drinks: ["Sides", "Desserts", "Pizza", "Burgers"],
  Desserts: ["Drinks", "Sides"],
};

async function getPopularItems() {
  return Order.aggregate([
    { $match: { status: "completed" } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.menuItem",
        ordered: { $sum: "$items.quantity" },
      },
    },
    { $sort: { ordered: -1 } },
    { $limit: 100 },
    {
      $lookup: {
        from: "menuitems",
        localField: "_id",
        foreignField: "_id",
        as: "item",
      },
    },
    { $unwind: "$item" },
    { $match: { "item.available": true } },
    {
      $project: {
        _id: "$item._id",
        name: "$item.name",
        description: "$item.description",
        category: "$item.category",
        price: "$item.price",
        vegetarian: "$item.vegetarian",
        ordered: 1,
      },
    },
  ]);
}

router.get("/recommendations", async (_req, res, next) => {
  try {
    res.json((await getPopularItems()).slice(0, 3));
  } catch (error) {
    next(error);
  }
});

router.get("/recommendations/for-you", optionalProtect, async (req, res, next) => {
  try {
    const [popular, menuItems] = await Promise.all([
      getPopularItems(),
      MenuItem.find({ available: true }).lean(),
    ]);
    const fallback = {
      items: popular.slice(0, 3),
      personalized: false,
    };
    if (req.user?.role !== "customer") return res.json(fallback);

    const history = await Order.find({
      user: req.user.id,
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("items createdAt")
      .lean();
    if (!history.length) return res.json(fallback);

    const menuById = new Map(menuItems.map((item) => [String(item._id), item]));
    const purchasedIds = new Set();
    const categoryPreferences = new Map();
    for (const order of history) {
      const ageDays = Math.max(
        0,
        (Date.now() - new Date(order.createdAt).getTime()) / 86400000,
      );
      const recencyWeight = Math.exp(-ageDays / 90);
      for (const orderItem of order.items) {
        const itemId = String(orderItem.menuItem);
        const menuItem = menuById.get(itemId);
        if (!menuItem) continue;
        purchasedIds.add(itemId);
        const quantity = Math.max(1, Number(orderItem.quantity) || 1);
        categoryPreferences.set(
          menuItem.category,
          (categoryPreferences.get(menuItem.category) || 0) +
            quantity * recencyWeight,
        );
      }
    }
    if (!categoryPreferences.size) return res.json(fallback);

    const maxPreference = Math.max(...categoryPreferences.values());
    const maxPopularity = Math.max(1, ...popular.map((item) => item.ordered));
    const ranked = menuItems
      .filter((item) => !purchasedIds.has(String(item._id)))
      .map((item) => {
        const directPreference =
          (categoryPreferences.get(item.category) || 0) / maxPreference;
        const complementaryPreference = Object.entries(COMPLEMENTS_MAP).reduce(
          (score, [category, complements]) =>
            complements.includes(item.category)
              ? score + (categoryPreferences.get(category) || 0) / maxPreference
              : score,
          0,
        );
        const popularity =
          (popular.find((entry) => String(entry._id) === String(item._id))
            ?.ordered || 0) / maxPopularity;
        return {
          item,
          score:
            directPreference * 0.75 +
            Math.min(1, complementaryPreference) * 0.65 +
            popularity * 0.25,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(({ item }) => item);

    if (!ranked.length) return res.json(fallback);
    res.json({ items: ranked, personalized: true });
  } catch (error) {
    next(error);
  }
});

router.post("/recommendations/complementary", async (req, res, next) => {
  try {
    const { itemIds = [], categories = [] } = req.body;
    const targetCategories = new Set();

    categories.forEach((category) => {
      (COMPLEMENTS_MAP[category] || ["Sides", "Drinks"]).forEach((complement) =>
        targetCategories.add(complement),
      );
    });

    if (itemIds.length) {
      const cartItems = await MenuItem.find({ _id: { $in: itemIds } });
      cartItems.forEach((item) => {
        (COMPLEMENTS_MAP[item.category] || ["Sides", "Drinks"]).forEach(
          (complement) => targetCategories.add(complement),
        );
      });
    }

    if (!targetCategories.size) {
      ["Sides", "Drinks", "Desserts"].forEach((category) =>
        targetCategories.add(category),
      );
    }

    const query = {
      available: true,
      category: { $in: Array.from(targetCategories) },
      _id: { $nin: itemIds },
    };
    const [popularity, items] = await Promise.all([
      Order.aggregate([
        { $match: { status: "completed" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.menuItem",
            ordered: { $sum: "$items.quantity" },
          },
        },
      ]),
      MenuItem.find(query),
    ]);
    const orderCounts = new Map(
      popularity.map((entry) => [String(entry._id), entry.ordered]),
    );
    items.sort((left, right) => {
      const countDifference =
        (orderCounts.get(String(right._id)) || 0) -
        (orderCounts.get(String(left._id)) || 0);
      return countDifference || left.name.localeCompare(right.name);
    });
    res.json(items.slice(0, 4));
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const query = { available: true };
    if (req.query.category && req.query.category !== "All")
      query.category = req.query.category;
    if (req.query.search)
      query.name = { $regex: req.query.search, $options: "i" };
    res.json(await MenuItem.find(query).sort({ category: 1, name: 1 }));
  } catch (error) {
    next(error);
  }
});

router.get("/categories", async (_req, res, next) => {
  try {
    res.json(await MenuItem.distinct("category", { available: true }));
  } catch (error) {
    next(error);
  }
});

router.get(
  "/admin/all",
  protect,
  allowRoles("admin"),
  async (_req, res, next) => {
    try {
      res.json(await MenuItem.find().sort({ category: 1, name: 1 }));
    } catch (error) {
      next(error);
    }
  },
);

router.post("/", protect, allowRoles("admin"), async (req, res, next) => {
  try {
    res.status(201).json(await MenuItem.create(req.body));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", protect, allowRoles("admin"), async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: "Menu item not found." });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

export default router;