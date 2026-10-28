/**
 * CraveHub / DineIQ - Automated Workflow Verification Script
 * Tests:
 * 1. Customer Authentication (Login/Register)
 * 2. Menu Fetch & Cross-Category Complementary Recommendations (e.g. Pizza -> Sides/Drinks)
 * 3. Order Placement & Cart Checkout
 * 4. Dedicated Live Order Tracking API
 * 5. Kitchen Workflow (Queue view & status advancement: placed -> preparing -> ready -> completed)
 * 6. Customer Feedback Submission & Sentiment Classification
 * 7. Admin Dashboard Analytics, Sentiment Breakdown, & AI Demand Prediction
 */

const API = process.env.API_URL || "http://localhost:5000/api";

async function request(path, options = {}, token) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Request failed.`);
  return data;
}

function logStep(step, detail) {
  console.log(`\x1b[36m[STEP ${step}]\x1b[0m ${detail}`);
}

function logPass(message) {
  console.log(`  \x1b[32m✔ PASS:\x1b[0m ${message}`);
}

function logFail(message, err) {
  console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${message}`, err ? `\n    ${err.message}` : "");
}

async function runVerification() {
  console.log("\n=======================================================");
  console.log("    DINEIQ - WORKFLOW VERIFICATION SUITE");
  console.log("=======================================================\n");

  let customerToken = "";
  let kitchenToken = "";
  let adminToken = "";
  let testOrderId = "";
  let pizzaItemId = "";

  try {
    // 1. Health Check
    logStep(1, "Verifying API Server Health...");
    const health = await request("/health");
    if (health.status === "ok") {
      logPass(`API is healthy (${health.service})`);
    } else {
      throw new Error("API health check failed");
    }

    // 2. Staff & Customer Authentication
    logStep(2, "Authenticating Customer, Kitchen, and Admin accounts...");
    const customerAuth = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "customer@dineiq.local", password: "dineiq123" }),
    });
    customerToken = customerAuth.token;
    logPass(`Logged in as Customer: ${customerAuth.user.name}`);

    const kitchenAuth = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "kitchen@dineiq.local", password: "dineiq123" }),
    });
    kitchenToken = kitchenAuth.token;
    logPass(`Logged in as Kitchen Staff: ${kitchenAuth.user.name}`);

    const adminAuth = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@dineiq.local", password: "dineiq123" }),
    });
    adminToken = adminAuth.token;
    logPass(`Logged in as Admin: ${adminAuth.user.name}`);

    // 3. Menu & Recommendations
    logStep(3, "Testing Menu Browsing & Recommendations Engine...");
    const menu = await request("/menu");
    logPass(`Retrieved ${menu.length} active menu items.`);

    const pizzaItem = menu.find((item) => item.category === "Pizza") || menu[0];
    pizzaItemId = pizzaItem._id;
    logPass(`Selected target item: "${pizzaItem.name}" (${pizzaItem.category}) - ₹${pizzaItem.price}`);

    // Test Complementary Recommendations (e.g. Pizza -> Sides/Drinks)
    const complementary = await request("/menu/recommendations/complementary", {
      method: "POST",
      body: JSON.stringify({ itemIds: [pizzaItemId], categories: [pizzaItem.category] }),
    });
    if (complementary.length > 0) {
      logPass(
        `Complementary suggestions for "${pizzaItem.name}": ` +
          complementary.map((i) => `"${i.name}" (${i.category})`).join(", ")
      );
    } else {
      throw new Error("No complementary recommendations returned.");
    }

    // 4. Order Creation
    logStep(4, "Placing a new customer order...");
    const order = await request(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify({
          items: [
            { menuItem: pizzaItemId, quantity: 1 },
            { menuItem: complementary[0]._id, quantity: 1 },
          ],
          paymentMethod: "card",
        }),
      },
      customerToken
    );
    testOrderId = order._id;
    logPass(`Order #${testOrderId.slice(-6).toUpperCase()} created successfully! Total: ₹${order.total}`);

    // 5. Dedicated Order Tracking API
    logStep(5, "Verifying Dedicated Live Order Tracking API...");
    const trackedOrder = await request(`/orders/${testOrderId}`, {}, customerToken);
    logPass(`Fetched order tracking data. Current status: [${trackedOrder.status.toUpperCase()}]`);

    // 6. Kitchen Queue & Status Advancement
    logStep(6, "Testing Kitchen Queue and Order Flow...");
    const activeOrders = await request("/orders/active", {}, kitchenToken);
    const inQueue = activeOrders.find((o) => o._id === testOrderId);
    if (!inQueue) {
      throw new Error(`Order #${testOrderId} not found in kitchen active queue.`);
    }
    logPass(`Order verified in Kitchen Queue (Current stage: ${inQueue.status})`);

    // Advance to preparing
    const preparingOrder = await request(
      `/orders/${testOrderId}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "preparing" }) },
      kitchenToken
    );
    logPass(`Advanced order to: [${preparingOrder.status.toUpperCase()}]`);

    // Advance to ready
    const readyOrder = await request(
      `/orders/${testOrderId}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "ready" }) },
      kitchenToken
    );
    logPass(`Advanced order to: [${readyOrder.status.toUpperCase()}]`);

    // Advance to completed
    const completedOrder = await request(
      `/orders/${testOrderId}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "completed" }) },
      kitchenToken
    );
    logPass(`Advanced order to: [${completedOrder.status.toUpperCase()}]`);

    // 7. Customer Feedback & Sentiment Classification
    logStep(7, "Testing Feedback Sentiment Analysis...");
    const feedback = await request(
      "/feedback",
      {
        method: "POST",
        body: JSON.stringify({
          order: testOrderId,
          rating: 5,
          comment: "The pizza was amazingly hot and truffle fries were crispy!",
        }),
      },
      customerToken
    );
    logPass(`Submitted feedback. Rating: 5/5, Classified Sentiment: [${feedback.sentiment.toUpperCase()}]`);

    // 8. Admin Analytics & AI Demand Prediction
    logStep(8, "Testing Admin Overview & AI Demand Prediction...");
    const overview = await request("/analytics/overview", {}, adminToken);
    logPass(
      `Analytics: Today's Orders: ${overview.today.orders}, Revenue: ₹${overview.today.revenue}, Feedback Sentiments: ` +
        JSON.stringify(overview.feedback.sentiments)
    );

    const forecast = await request("/analytics/demand-forecast", {}, adminToken);
    logPass(`AI Forecast Headline: "${forecast.headline}"`);
    logPass(`Kitchen Advice: "${forecast.kitchenAdvice}"`);
    if (forecast.categories && forecast.categories.length) {
      logPass(
        "Forecast by Category: " +
          forecast.categories.map((c) => `${c.category}: ${c.demand} (${c.projectedOrders} orders)`).join(" | ")
      );
    }

    console.log("\n=======================================================");
    console.log("   ALL CRAVEHUB WORKFLOWS PASSED SUCCESSFULLY! ✔");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("\n=======================================================");
    console.error(`   VERIFICATION FAILED: ${err.message}`);
    console.error("=======================================================\n");
    process.exit(1);
  }
}

runVerification();

