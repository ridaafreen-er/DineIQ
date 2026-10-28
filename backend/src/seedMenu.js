import MenuItem from "./models/MenuItem.js";
import Inventory from "./models/Inventory.js";
import User from "./models/User.js";
import Order from "./models/Order.js";
import Feedback from "./models/Feedback.js";
const items = [
  [
    "Smoky Paneer Burger",
    "Grilled paneer, smoky sauce, lettuce and brioche.",
    "Burgers",
    219,
    true,
  ],
  [
    "Classic Chicken Burger",
    "Crispy chicken, pickles, cheese and house sauce.",
    "Burgers",
    249,
    false,
  ],
  [
    "Margherita Pizza",
    "San Marzano tomato, mozzarella and basil.",
    "Pizza",
    299,
    true,
  ],
  [
    "Spicy Chicken Pizza",
    "Chicken, peppers, onion and chilli oil.",
    "Pizza",
    369,
    false,
  ],
  [
    "Truffle Fries",
    "Golden fries with truffle seasoning and parmesan.",
    "Sides",
    149,
    true,
  ],
  [
    "Loaded Nachos",
    "Corn chips, salsa, beans, cheese and jalapeños.",
    "Sides",
    189,
    true,
  ],
  ["Cold Coffee", "Creamy iced coffee topped with foam.", "Drinks", 129, true],
  [
    "Chocolate Lava Cake",
    "Warm chocolate cake with a molten centre.",
    "Desserts",
    159,
    true,
  ],
];
export async function seedMenu() {
  if (!(await MenuItem.countDocuments())) {
    await MenuItem.insertMany(
      items.map(([name, description, category, price, vegetarian]) => ({
        name,
        description,
        category,
        price,
        vegetarian,
      })),
    );
    console.log("Seeded menu items.");
  }
  const menu = await MenuItem.find();
  for (const item of menu)
    await Inventory.updateOne(
      { menuItem: item._id },
      { $setOnInsert: { currentStock: 25, lowStockThreshold: 5 } },
      { upsert: true },
    );

  if (process.env.NODE_ENV === "production") {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in production.");
    }
    if (!(await User.exists({ email }))) {
      await User.create({
        name: process.env.ADMIN_NAME || "Restaurant Admin",
        email,
        password,
        role: "admin",
      });
      console.log("Created the configured production admin account.");
    }
    return;
  }

  for (const [name, email, role] of [
    ["DineIQ Admin", "admin@dineiq.local", "admin"],
    ["Kitchen Team", "kitchen@dineiq.local", "kitchen"],
    ["Sarah Jenkins", "customer@dineiq.local", "customer"],
  ]) {
    if (!(await User.exists({ email })))
      await User.create({ name, email, password: "dineiq123", role });
  }

  // Seed sample orders if none exist
  if (!(await Order.countDocuments())) {
    const customer = await User.findOne({ email: "customer@dineiq.local" });
    const itemsMap = {};
    menu.forEach((m) => {
      itemsMap[m.name] = m;
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const sampleOrdersData = [
      {
        daysAgo: 4,
        status: "completed",
        items: [
          { name: "Margherita Pizza", qty: 2 },
          { name: "Truffle Fries", qty: 1 },
          { name: "Cold Coffee", qty: 2 },
        ],
      },
      {
        daysAgo: 3,
        status: "completed",
        items: [
          { name: "Spicy Chicken Pizza", qty: 1 },
          { name: "Loaded Nachos", qty: 1 },
          { name: "Cold Coffee", qty: 1 },
        ],
      },
      {
        daysAgo: 3,
        status: "completed",
        items: [
          { name: "Classic Chicken Burger", qty: 2 },
          { name: "Truffle Fries", qty: 2 },
        ],
      },
      {
        daysAgo: 2,
        status: "completed",
        items: [
          { name: "Smoky Paneer Burger", qty: 1 },
          { name: "Cold Coffee", qty: 1 },
          { name: "Chocolate Lava Cake", qty: 1 },
        ],
      },
      {
        daysAgo: 2,
        status: "completed",
        items: [
          { name: "Margherita Pizza", qty: 1 },
          { name: "Spicy Chicken Pizza", qty: 1 },
          { name: "Truffle Fries", qty: 1 },
        ],
      },
      {
        daysAgo: 1,
        status: "completed",
        items: [
          { name: "Margherita Pizza", qty: 2 },
          { name: "Cold Coffee", qty: 2 },
        ],
      },
      {
        daysAgo: 1,
        status: "completed",
        items: [
          { name: "Classic Chicken Burger", qty: 1 },
          { name: "Truffle Fries", qty: 1 },
          { name: "Chocolate Lava Cake", qty: 1 },
        ],
      },
      {
        daysAgo: 0,
        status: "preparing",
        items: [
          { name: "Spicy Chicken Pizza", qty: 1 },
          { name: "Loaded Nachos", qty: 1 },
        ],
      },
      {
        daysAgo: 0,
        status: "placed",
        items: [
          { name: "Smoky Paneer Burger", qty: 2 },
          { name: "Cold Coffee", qty: 2 },
        ],
      },
    ];

    const createdOrders = [];
    for (const sample of sampleOrdersData) {
      const orderItems = sample.items
        .map(({ name, qty }) => {
          const m = itemsMap[name];
          if (!m) return null;
          return {
            menuItem: m._id,
            name: m.name,
            price: m.price,
            quantity: qty,
          };
        })
        .filter(Boolean);

      const total = orderItems.reduce((s, it) => s + it.price * it.quantity, 0);
      const orderDate = new Date(now - sample.daysAgo * dayMs);

      const ord = await Order.create({
        user: customer._id,
        items: orderItems,
        total,
        paymentMethod: "card",
        paymentStatus: "paid",
        status: sample.status,
        createdAt: orderDate,
        updatedAt: orderDate,
      });
      createdOrders.push(ord);
    }
    console.log("Seeded sample orders.");

    // Seed feedback for completed orders
    if (!(await Feedback.countDocuments()) && createdOrders.length) {
      const sampleReviews = [
        {
          orderIndex: 0,
          rating: 5,
          comment: "The Truffle Fries and Margherita Pizza were hot and delicious!",
          sentiment: "positive",
        },
        {
          orderIndex: 1,
          rating: 5,
          comment: "Loved the spicy chicken pizza! Fast delivery and great flavors.",
          sentiment: "positive",
        },
        {
          orderIndex: 2,
          rating: 4,
          comment: "Tasty chicken burger, fries were crisp. Good experience.",
          sentiment: "positive",
        },
        {
          orderIndex: 3,
          rating: 3,
          comment: "Food was okay, but the cold coffee arrived slightly warm.",
          sentiment: "neutral",
        },
        {
          orderIndex: 4,
          rating: 1,
          comment: "Delivery was very late and pizza was cold and disappointed.",
          sentiment: "negative",
        },
      ];

      for (const rev of sampleReviews) {
        const targetOrder = createdOrders[rev.orderIndex];
        if (targetOrder && targetOrder.status === "completed") {
          await Feedback.create({
            user: customer._id,
            order: targetOrder._id,
            rating: rev.rating,
            comment: rev.comment,
            sentiment: rev.sentiment,
          });
        }
      }
      console.log("Seeded sample feedback reviews.");
    }
  }
}
