import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import "./styles.css";

function LoadingSpinner({ message = "Loading..." }) {
  return (
    <div className="loading-box">
      <div className="spinner" />
      <span>{message}</span>
    </div>
  );
}

function AlertBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="alert-banner">
      <span>⚠️ {message}</span>
      {onDismiss && <button onClick={onDismiss}>✕</button>}
    </div>
  );
}

function EmptyBox({ icon = "📦", title, message, action }) {
  return (
    <div className="empty-box">
      <div style={{ fontSize: "36px", marginBottom: "8px" }}>{icon}</div>
      {title && <h3>{title}</h3>}
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:5000/api");
const AppContext = createContext();
const money = (amount) => `₹${Number(amount).toFixed(0)}`;
async function request(path, options = {}, token) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}
function AppProvider({ children }) {
  const [session, setSession] = useState(() =>
    JSON.parse(localStorage.getItem("dineiq-session") || "null"),
  );
  const [cart, setCart] = useState(() =>
    JSON.parse(localStorage.getItem("dineiq-cart") || "[]"),
  );
  useEffect(
    () => localStorage.setItem("dineiq-cart", JSON.stringify(cart)),
    [cart],
  );
  const saveSession = (value) => {
    setSession(value);
    localStorage.setItem("dineiq-session", JSON.stringify(value));
  };
  const add = (item) =>
    setCart((current) => {
      const existing = current.find((row) => row._id === item._id);
      return existing
        ? current.map((row) =>
            row._id === item._id ? { ...row, quantity: row.quantity + 1 } : row,
          )
        : [...current, { ...item, quantity: 1 }];
    });
  const update = (id, quantity) =>
    setCart((current) =>
      quantity < 1
        ? current.filter((row) => row._id !== id)
        : current.map((row) => (row._id === id ? { ...row, quantity } : row)),
    );
  return (
    <AppContext.Provider
      value={{
        session,
        saveSession,
        cart,
        add,
        update,
        clearCart: () => setCart([]),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
const useApp = () => useContext(AppContext);
function Nav() {
  const { session, cart, saveSession } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = cart.reduce((n, item) => n + item.quantity, 0);

  const closeMobile = () => setMobileOpen(false);

  return (
    <nav>
      <Link className="brand" to="/" onClick={closeMobile}>
        Dine<span>IQ</span>
      </Link>
      <button
        className="mobile-toggle"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>
      <div className={`navlinks ${mobileOpen ? "open" : ""}`}>
        <Link to="/menu" onClick={closeMobile}>
          Menu
        </Link>
        {session ? (
          <>
            <Link to="/orders" onClick={closeMobile}>
              My orders
            </Link>
            {session.user.role === "kitchen" && (
              <Link to="/kitchen" onClick={closeMobile}>
                Kitchen
              </Link>
            )}
            {session.user.role === "admin" && (
              <Link to="/admin" onClick={closeMobile}>
                Admin
              </Link>
            )}
            <button
              className="link-button"
              onClick={() => {
                closeMobile();
                saveSession(null);
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" onClick={closeMobile}>
            Sign in
          </Link>
        )}
        <Link className="cart-link" to="/cart" onClick={closeMobile}>
          Cart <b>{count}</b>
        </Link>
      </div>
    </nav>
  );
}
function Home() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">SMART DINING, SIMPLIFIED</p>
        <h1>
          Good food.
          <br />
          <em>Zero waiting.</em>
        </h1>
        <p>
          Discover your favourites, order in seconds, and follow every bite from
          kitchen to table.
        </p>
        <Link className="button" to="/menu">
          Explore the menu →
        </Link>
      </section>
      <section className="value">
        <div>
          ⚡ <b>Order fast</b>
          <span>A smooth, simple checkout.</span>
        </div>
        <div>
          🍽️ <b>Made fresh</b>
          <span>Every order goes straight to the kitchen.</span>
        </div>
        <div>
          ✦ <b>Track it live</b>
          <span>Know exactly when it’s ready.</span>
        </div>
      </section>
    </>
  );
}
function Menu() {
  const { add, session } = useApp();
  const [items, setItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationMode, setRecommendationMode] = useState("popular");
  const [categories, setCategories] = useState(["All"]);
  const [active, setActive] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    request("/menu/categories")
      .then((data) => setCategories(["All", ...data]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    request("/menu/recommendations/for-you", {}, session?.token)
      .then(({ items: recommendedItems, personalized }) => {
        setRecommendations(recommendedItems);
        setRecommendationMode(personalized ? "personalized" : "popular");
      })
      .catch(() => {
        request("/menu/recommendations")
          .then((recommendedItems) => {
            setRecommendations(recommendedItems);
            setRecommendationMode("popular");
          })
          .catch(() => setRecommendations([]));
      });
  }, [session?.token]);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (active !== "All") q.set("category", active);
    if (search) q.set("search", search);
    request(`/menu?${q}`)
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [active, search]);

  return (
    <main>
      <div className="page-heading">
        <p className="eyebrow">OUR KITCHEN</p>
        <h2>Find your next favourite.</h2>
        <input
          placeholder="Search dishes (e.g. Pizza, Coffee)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="chips">
        {categories.map((c) => (
          <button
            key={c}
            className={active === c ? "active" : ""}
            onClick={() => setActive(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <AlertBanner message={error} onDismiss={() => setError("")} />

      {loading ? (
        <LoadingSpinner message="Cooking up the menu..." />
      ) : items.length === 0 ? (
        <EmptyBox
          icon="🔍"
          title="No dishes found"
          message={
            search
              ? `We couldn't find any dishes matching "${search}".`
              : "No dishes available in this category."
          }
          action={
            <button
              className="button"
              onClick={() => {
                setSearch("");
                setActive("All");
              }}
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="menu-grid">
          {items.map((item) => (
            <article className="dish" key={item._id}>
              <div className="dish-art">
                {item.category === "Pizza"
                  ? "🍕"
                  : item.category === "Burgers"
                    ? "🍔"
                    : item.category === "Drinks"
                      ? "🥤"
                      : item.category === "Desserts"
                        ? "🍫"
                        : "🍟"}
              </div>
              <div className="dish-body">
                <small>{item.vegetarian ? "● VEG" : "● NON-VEG"}</small>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div>
                  <b>{money(item.price)}</b>
                  <button onClick={() => add(item)}>Add +</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {recommendations.length > 0 && (
        <section className="recommendations">
          <div>
            <p className="eyebrow">
              {recommendationMode === "personalized"
                ? "BASED ON YOUR ORDER HISTORY"
                : "POPULAR PICKS"}
            </p>
            <h2>Worth trying next.</h2>
            <p>
              {recommendationMode === "personalized"
                ? "New dishes picked from your order patterns."
                : "Most ordered available dishes from completed orders."}
            </p>
          </div>
          <div className="recommendation-list">
            {recommendations.map((item) => (
              <article key={item._id}>
                <div>
                  <b>{item.name}</b>
                  <span>
                    {item.category} · {money(item.price)}
                  </span>
                </div>
                <button className="small-button" onClick={() => add(item)}>
                  Add +
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Cart() {
  const { cart, update, add } = useApp();
  const [complementary, setComplementary] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Fetch cross-category complementary recommendations (e.g. Pizza -> Fries or Cold Coffee)
  useEffect(() => {
    if (!cart.length) {
      setComplementary([]);
      return;
    }
    setLoadingRecs(true);
    request("/menu/recommendations/complementary", {
      method: "POST",
      body: JSON.stringify({
        itemIds: cart.map((i) => i._id),
        categories: cart.map((i) => i.category),
      }),
    })
      .then((items) => setComplementary(items))
      .catch(() => {})
      .finally(() => setLoadingRecs(false));
  }, [cart.map((i) => i._id).join(",")]);

  if (!cart.length)
    return (
      <main className="empty">
        <EmptyBox
          icon="🛒"
          title="Your cart is empty."
          message="Something delicious is waiting for you."
          action={
            <Link className="button" to="/menu">
              Browse the menu
            </Link>
          }
        />
      </main>
    );

  return (
    <main className="two-col">
      <section>
        <p className="eyebrow">YOUR ORDER</p>
        <h2>Cart</h2>
        {cart.map((item) => (
          <div className="cart-row" key={item._id}>
            <div>
              <h3>{item.name}</h3>
              <p>{money(item.price)} each</p>
            </div>
            <div className="quantity">
              <button onClick={() => update(item._id, item.quantity - 1)}>
                −
              </button>
              <span>{item.quantity}</span>
              <button onClick={() => update(item._id, item.quantity + 1)}>
                +
              </button>
            </div>
            <b>{money(item.price * item.quantity)}</b>
          </div>
        ))}

        {complementary.length > 0 && (
          <div className="cart-recommendations">
            <h4>Pairs well with your order</h4>
            <p className="hint">
              Popular sides, drinks, and desserts to complete your meal
            </p>
            <div className="cart-recommendations-grid">
              {complementary.map((rec) => (
                <div key={rec._id} className="cart-rec-card">
                  <div>
                    <b>{rec.name}</b>
                    <span>
                      {rec.category} · {money(rec.price)}
                    </span>
                  </div>
                  <button className="small-button" onClick={() => add(rec)}>
                    Add +
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <aside className="summary">
        <h3>Order summary</h3>
        <div>
          <span>Subtotal</span>
          <b>{money(total)}</b>
        </div>
        <div>
          <span>Service charge</span>
          <b>₹0</b>
        </div>
        <hr />
        <div className="total">
          <span>Total</span>
          <b>{money(total)}</b>
        </div>
        <Link className="button full" to="/checkout">
          Continue to checkout
        </Link>
      </aside>
    </main>
  );
}
function Auth({ mode }) {
  const { saveSession } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const data = await request(
        `/auth/${mode === "login" ? "login" : "register"}`,
        { method: "POST", body: JSON.stringify(form) },
      );
      saveSession(data);
      navigate("/menu");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <main className="auth">
      <form onSubmit={submit}>
        <p className="eyebrow">WELCOME TO DINEIQ</p>
        <h2>{mode === "login" ? "Welcome back." : "Create your account."}</h2>
        {mode === "register" && (
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
        )}
        <label>
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <input
            required
            minLength="6"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button full">
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
        <p>
          {mode === "login" ? "New to DineIQ? " : "Already a member? "}
          <Link to={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </form>
    </main>
  );
}
function Checkout() {
  const { session, cart, clearCart } = useApp();
  const navigate = useNavigate();
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState("");
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!cart.length) return <Navigate to="/cart" />;
  if (!session) return <Navigate to="/login" />;
  const submit = async (e) => {
    e.preventDefault();
    try {
      const order = await request(
        "/orders",
        {
          method: "POST",
          body: JSON.stringify({
            items: cart.map((item) => ({
              menuItem: item._id,
              quantity: item.quantity,
            })),
            paymentMethod: method,
          }),
        },
        session.token,
      );
      clearCart();
      navigate(`/orders/${order._id}/track`, {
        state: {
          message: `Order #${order._id.slice(-6).toUpperCase()} placed successfully!`,
        },
      });
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <main className="two-col">
      <section>
        <p className="eyebrow">FINAL STEP</p>
        <h2>Checkout</h2>
        <AlertBanner message={error} onDismiss={() => setError("")} />
        <form className="checkout" onSubmit={submit}>
          <h3>Payment method</h3>
          <label className="radio">
            <input
              type="radio"
              checked={method === "cash"}
              onChange={() => setMethod("cash")}
            />{" "}
            Cash on delivery / pickup
          </label>
          <label className="radio">
            <input
              type="radio"
              checked={method === "card"}
              onChange={() => setMethod("card")}
            />{" "}
            Demo card payment
          </label>
          <button className="button">Place order · {money(total)}</button>
        </form>
      </section>
      <aside className="summary">
        <h3>You’re ordering</h3>
        {cart.map((item) => (
          <p key={item._id}>
            {item.quantity}× {item.name}
          </p>
        ))}
        <hr />
        <div className="total">
          <span>Total</span>
          <b>{money(total)}</b>
        </div>
      </aside>
    </main>
  );
}

function Orders() {
  const { session } = useApp();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session) {
      setLoading(true);
      request("/orders/mine", {}, session.token)
        .then((data) => {
          setOrders(data);
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    }
  }, [session]);

  if (!session) return <Navigate to="/login" />;

  return (
    <main>
      <p className="eyebrow">ORDER HISTORY</p>
      <h2>Your orders</h2>
      <AlertBanner message={error} onDismiss={() => setError("")} />

      {loading ? (
        <LoadingSpinner message="Fetching your orders..." />
      ) : !orders.length ? (
        <EmptyBox
          icon="🧾"
          title="No orders yet"
          message="You haven’t placed an order with us yet. Explore our delicious kitchen offerings!"
          action={
            <Link className="button" to="/menu">
              Start ordering
            </Link>
          }
        />
      ) : (
        orders.map((order) => (
          <article className="order" key={order._id}>
            <div>
              <p className="order-id">
                ORDER #{order._id.slice(-6).toUpperCase()}
              </p>
              <h3>
                {order.items
                  .map((item) => `${item.quantity}× ${item.name}`)
                  .join(" · ")}
              </h3>
              <p>{new Date(order.createdAt).toLocaleString()}</p>
              <OrderTimeline status={order.status} />

              <div
                style={{
                  marginTop: "14px",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  className="small-button"
                  to={`/orders/${order._id}/track`}
                >
                  {order.status !== "completed" && order.status !== "cancelled"
                    ? "Track Live ⏱️"
                    : "View Receipt"}
                </Link>
                {order.status === "completed" && (
                  <FeedbackForm orderId={order._id} />
                )}
              </div>
            </div>
            <div>
              <span className={`status ${order.status}`}>{order.status}</span>
              <b>{money(order.total)}</b>
            </div>
          </article>
        ))
      )}
    </main>
  );
}

function TrackOrder() {
  const { id } = useParams();
  const { session } = useApp();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchOrder = () => {
    if (!session) return;
    request(`/orders/${id}`, {}, session.token)
      .then((data) => {
        setOrder(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(() => {
      fetchOrder();
    }, 3500);
    return () => clearInterval(interval);
  }, [id, session]);

  if (!session) return <Navigate to="/login" />;
  if (loading)
    return (
      <main>
        <LoadingSpinner message="Checking live kitchen status..." />
      </main>
    );

  if (error || !order)
    return (
      <main>
        <AlertBanner message={error || "Order not found."} />
        <Link to="/orders" className="button">
          Back to my orders
        </Link>
      </main>
    );

  const stageDetails = {
    placed: {
      title: "Order Placed & Sent to Kitchen",
      desc: "Your order is confirmed and queued for preparation.",
      eta: "Est: ~15 mins",
    },
    preparing: {
      title: "Chef is Cooking Your Meal",
      desc: "Fresh ingredients are on the grill right now.",
      eta: "Est: 8–10 mins",
    },
    ready: {
      title: "Hot and Ready!",
      desc: "Your meal is fresh, packaged, and ready for pickup / table service.",
      eta: "Ready now",
    },
    completed: {
      title: "Order Completed",
      desc: "Delivered and served. We hope you loved every bite!",
      eta: "Delivered",
    },
    cancelled: {
      title: "Order Cancelled",
      desc: "This order has been cancelled.",
      eta: "Cancelled",
    },
  };

  const info = stageDetails[order.status] || stageDetails.placed;

  return (
    <main className="track-container">
      <div className="track-header">
        <div>
          <p className="eyebrow">ORDER #{order._id.slice(-6).toUpperCase()}</p>
          <h2>Live Order Tracking</h2>
        </div>
        {order.status !== "completed" && order.status !== "cancelled" && (
          <span className="live-badge">
            <span className="pulse-dot" /> Live Status
          </span>
        )}
      </div>

      <div className="track-eta-banner">
        <h3>{info.title}</h3>
        <p>{info.desc}</p>
        <div
          style={{
            marginTop: "12px",
            fontFamily: "DM Mono, monospace",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          ⏱️ {info.eta}
        </div>
      </div>

      <div className="track-card">
        <OrderTimeline status={order.status} />

        <div className="track-items">
          <p className="eyebrow" style={{ marginTop: "24px" }}>
            ORDERED ITEMS
          </p>
          {order.items.map((item) => (
            <div key={item.menuItem} className="track-item-row">
              <span>
                {item.quantity}× {item.name}
              </span>
              <b>{money(item.price * item.quantity)}</b>
            </div>
          ))}
          <div
            className="track-item-row"
            style={{
              borderTop: "2px solid var(--line)",
              marginTop: "12px",
              paddingTop: "12px",
              fontSize: "16px",
            }}
          >
            <span>Total ({order.paymentMethod.toUpperCase()})</span>
            <b>{money(order.total)}</b>
          </div>
        </div>

        {order.status === "completed" && (
          <div
            style={{
              marginTop: "24px",
              paddingTop: "18px",
              borderTop: "1px solid var(--line)",
            }}
          >
            <h3 style={{ marginBottom: "12px" }}>How was your meal?</h3>
            <FeedbackForm orderId={order._id} />
          </div>
        )}

        <div style={{ marginTop: "24px", display: "flex", gap: "12px" }}>
          <Link
            to="/orders"
            className="button"
            style={{ background: "#4a5546" }}
          >
            View all orders
          </Link>
          <Link to="/menu" className="button">
            Browse menu →
          </Link>
        </div>
      </div>
    </main>
  );
}
function OrderTimeline({ status }) {
  const steps = ["placed", "preparing", "ready", "completed"];
  const current = steps.indexOf(status);
  if (current < 0) return null;
  return (
    <div className="order-timeline" aria-label={`Order status: ${status}`}>
      {steps.map((step, index) => (
        <div className={index <= current ? "done" : ""} key={step}>
          <i>{index < current ? "✓" : index + 1}</i>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}
function FeedbackForm({ orderId }) {
  const { session } = useApp();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    try {
      await request(
        "/feedback",
        {
          method: "POST",
          body: JSON.stringify({ order: orderId, rating, comment }),
        },
        session.token,
      );
      setMessage("Thanks for your feedback!");
    } catch (error) {
      setMessage(error.message);
    }
  };
  if (!open)
    return (
      <button className="small-button" onClick={() => setOpen(true)}>
        Leave feedback
      </button>
    );
  return (
    <form className="feedback-form" onSubmit={submit}>
      <label>
        Rating{" "}
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} star{value !== 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>
      <input
        placeholder="Tell us about your order (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button className="small-button">Submit review</button>
      {message && <small>{message}</small>}
    </form>
  );
}
function StaffOnly({ roles, children }) {
  const { session } = useApp();
  if (!session) return <Navigate to="/login" />;
  return roles.includes(session.user.role) ? children : <Navigate to="/" />;
}
function KitchenDashboard() {
  const { session } = useApp();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    request("/orders/active", {}, session.token)
      .then((data) => {
        setOrders(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const advance = async (order, status) => {
    try {
      await request(
        `/orders/${order._id}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) },
        session.token,
      );
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const next = { placed: "preparing", preparing: "ready", ready: "completed" };

  return (
    <main>
      <p className="eyebrow">STAFF AREA</p>
      <h2>Kitchen queue</h2>
      <p className="dashboard-intro">
        Move every order through the kitchen as it is prepared.
      </p>
      <AlertBanner message={error} onDismiss={() => setError("")} />

      {loading && !orders.length ? (
        <LoadingSpinner message="Checking kitchen queue..." />
      ) : orders.length === 0 ? (
        <EmptyBox
          icon="👨‍🍳"
          title="Kitchen queue is clear!"
          message="No active orders right now. New customer orders will appear here automatically."
        />
      ) : (
        <div className="kitchen-grid">
        {["placed", "preparing", "ready"].map((stage) => (
          <section className="kitchen-column" key={stage}>
            <h3>{stage}</h3>
            {orders
              .filter((order) => order.status === stage)
              .map((order) => (
                <article className="ticket" key={order._id}>
                  <small>
                    #{order._id.slice(-6).toUpperCase()} ·{" "}
                    {order.user?.name || "Guest"}
                  </small>
                  {order.items.map((item) => (
                    <p key={item.menuItem}>
                      {item.quantity}× {item.name}
                    </p>
                  ))}
                  <button
                    className="small-button"
                    onClick={() => advance(order, next[stage])}
                  >
                    {next[stage] === "completed"
                      ? "Mark completed"
                      : `Mark ${next[stage]}`}
                  </button>
                </article>
              ))}
            {!orders.some((order) => order.status === stage) && (
              <p className="muted">Nothing here.</p>
            )}
          </section>
        ))}
      </div>
      )}
    </main>
  );
}
function AdminDashboard() {
  const { session } = useApp();
  const [data, setData] = useState({
    overview: null,
    menu: [],
    inventory: [],
    feedback: [],
    forecast: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "Burgers",
    price: "",
    vegetarian: true,
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      request("/analytics/overview", {}, session.token),
      request("/menu/admin/all", {}, session.token),
      request("/inventory", {}, session.token),
      request("/feedback", {}, session.token),
      request("/analytics/demand-forecast", {}, session.token).catch(() => null),
    ])
      .then(([overview, menu, inventory, feedback, forecast]) => {
        setData({ overview, menu, inventory, feedback, forecast });
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const saveMenu = async (event) => {
    event.preventDefault();
    try {
      await request(
        "/menu",
        {
          method: "POST",
          body: JSON.stringify({ ...form, price: Number(form.price) }),
        },
        session.token,
      );
      setForm({
        name: "",
        description: "",
        category: "Burgers",
        price: "",
        vegetarian: true,
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setAvailability = async (item) => {
    await request(
      `/menu/${item._id}`,
      { method: "PATCH", body: JSON.stringify({ available: !item.available }) },
      session.token,
    );
    load();
  };

  const setStock = async (inventory, value) => {
    try {
      await request(
        `/inventory/${inventory._id}`,
        { method: "PATCH", body: JSON.stringify({ currentStock: value }) },
        session.token,
      );
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const overview = data.overview;
  const totalSentiments = overview
    ? (overview.feedback.sentiments.positive || 0) +
      (overview.feedback.sentiments.neutral || 0) +
      (overview.feedback.sentiments.negative || 0)
    : 0;

  return (
    <main>
      <p className="eyebrow">ADMIN AREA</p>
      <h2>Restaurant overview</h2>
      <AlertBanner message={error} onDismiss={() => setError("")} />

      {loading && !overview ? (
        <LoadingSpinner message="Calculating real-time analytics..." />
      ) : (
        overview && (
          <>
            <section className="metrics">
              <article>
                <span>Orders today</span>
                <b>{overview.today.orders}</b>
              </article>
              <article>
                <span>Revenue today</span>
                <b>{money(overview.today.revenue)}</b>
              </article>
              <article>
                <span>Guest rating</span>
                <b>
                  {overview.feedback.count
                    ? `${overview.feedback.averageRating.toFixed(1)} / 5`
                    : "—"}
                </b>
              </article>
              <article>
                <span>Low stock items</span>
                <b>{overview.lowStock.length}</b>
              </article>
            </section>

            <section className="sentiment-summary">
              <div>
                <span>😊 Positive feedback</span>
                <b>{overview.feedback.sentiments.positive}</b>
              </div>
              <div>
                <span>😐 Neutral feedback</span>
                <b>{overview.feedback.sentiments.neutral}</b>
              </div>
              <div>
                <span>☹️ Negative feedback</span>
                <b>{overview.feedback.sentiments.negative}</b>
              </div>
            </section>

            {totalSentiments > 0 && (
              <div
                className="sentiment-meter-bar"
                title={`Sentiment Distribution: ${Math.round((overview.feedback.sentiments.positive / totalSentiments) * 100)}% Positive`}
              >
                <div
                  className="bar positive"
                  style={{
                    width: `${(overview.feedback.sentiments.positive / totalSentiments) * 100}%`,
                  }}
                />
                <div
                  className="bar neutral"
                  style={{
                    width: `${(overview.feedback.sentiments.neutral / totalSentiments) * 100}%`,
                  }}
                />
                <div
                  className="bar negative"
                  style={{
                    width: `${(overview.feedback.sentiments.negative / totalSentiments) * 100}%`,
                  }}
                />
              </div>
            )}
          </>
        )
      )}

      {/* AI Demand Prediction & Kitchen Forecast */}
      {data.forecast && (
        <section className="admin-card wide forecast-card">
          <div className="forecast-header">
            <div>
              <p className="eyebrow">DEMAND FORECAST</p>
              <h3>{data.forecast.headline}</h3>
              <p className="forecast-advice">💡 {data.forecast.kitchenAdvice}</p>
              <small>{data.forecast.historyDays} completed-order days in the last {data.forecast.lookbackDays} days | {data.forecast.confidence} confidence</small>
            </div>
            <span className="badge-date">{data.forecast.forecastDate}</span>
          </div>

          <div className="forecast-grid">
            {data.forecast.categories.map((cat) => (
              <div
                key={cat.category}
                className="forecast-item"
              >
                <div className="forecast-item-header">
                  <b>{cat.category}</b>
                  <span className={`pill ${cat.badge || "medium"}`}>
                    {cat.demand}
                  </span>
                </div>
                <p className="proj-count">~{cat.projectedOrders} orders expected</p>
                <small className="trend">Trend: {cat.trend}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="admin-grid">
        <section className="admin-card">
          <h3>Add menu item</h3>
          <form className="stack-form" onSubmit={saveMenu}>
            <input
              required
              placeholder="Dish name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              required
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
            <div>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {["Burgers", "Pizza", "Sides", "Drinks", "Desserts"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
              <input
                required
                type="number"
                min="0"
                placeholder="Price"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.vegetarian}
                onChange={(e) =>
                  setForm({ ...form, vegetarian: e.target.checked })
                }
              />{" "}
              Vegetarian
            </label>
            <button className="button">Add dish</button>
          </form>
        </section>
        <section className="admin-card">
          <h3>Top ordered</h3>
          {overview?.topItems.length ? (
            overview.topItems.map((item) => (
              <p className="list-row" key={item._id}>
                <span>{item._id}</span>
                <b>{item.ordered} ordered</b>
              </p>
            ))
          ) : (
            <p className="muted">No orders yet.</p>
          )}
        </section>
      </div>
      <section className="admin-card wide">
        <h3>Menu availability</h3>
        {data.menu.map((item) => (
          <div className="list-row" key={item._id}>
            <span>
              {item.name} <small>{money(item.price)}</small>
            </span>
            <button
              className="small-button"
              onClick={() => setAvailability(item)}
            >
              {item.available ? "Available" : "Hidden"}
            </button>
          </div>
        ))}
      </section>
      <section className="admin-card wide">
        <h3>Inventory</h3>
        {data.inventory.map((item) => (
          <div
            className={`list-row ${item.currentStock <= item.lowStockThreshold ? "low-stock" : ""}`}
            key={item._id}
          >
            <span>
              {item.menuItem?.name || "Deleted item"}{" "}
              <small>Low at {item.lowStockThreshold}</small>
            </span>
            <label>
              Stock{" "}
              <input
                type="number"
                min="0"
                defaultValue={item.currentStock}
                onBlur={(e) =>
                  Number(e.target.value) !== item.currentStock &&
                  setStock(item, Number(e.target.value))
                }
              />
            </label>
          </div>
        ))}
      </section>
      <section className="admin-card wide">
        <h3>Latest feedback</h3>
        {data.feedback.length ? (
          data.feedback.map((item) => (
            <div className="feedback-row" key={item._id}>
              <b>
                {item.rating}/5 · {item.sentiment}
              </b>
              <span>{item.comment || "No written comment"}</span>
              <small>{item.user?.name}</small>
            </div>
          ))
        ) : (
          <p className="muted">No feedback yet.</p>
        )}
      </section>
    </main>
  );
}

function Layout() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id/track" element={<TrackOrder />} />
        <Route
          path="/kitchen"
          element={
            <StaffOnly roles={["kitchen", "admin"]}>
              <KitchenDashboard />
            </StaffOnly>
          }
        />
        <Route
          path="/admin"
          element={
            <StaffOnly roles={["admin"]}>
              <AdminDashboard />
            </StaffOnly>
          }
        />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <footer>© 2026 DineIQ · Made for good moments.</footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Layout />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
