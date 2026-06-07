import { Form, useLoaderData } from "react-router";
import { requireUser } from "../auth.server";
import { redirect } from "react-router";
import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "Dashboard - Coupon Pulse" },
    { name: "description", content: "Manage your Coupon Pulse subscription" },
  ];
};

export const loader = async ({ request }) => {
  const user = await requireUser(request);
  return { user };
};

export const action = async ({ request }) => {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "install-store") {
    const shop = formData.get("shop")?.toString().trim().toLowerCase();

    if (!shop) {
      return { error: "Store URL is required" };
    }

    let shopDomain = shop;
    if (!shopDomain.includes(".")) {
      shopDomain = shopDomain + ".myshopify.com";
    } else if (!shopDomain.includes(".myshopify.com")) {
      shopDomain = shopDomain.replace(/^https?:\/\//, "").split("/")[0];
      if (!shopDomain.endsWith(".myshopify.com")) {
        shopDomain = shopDomain + ".myshopify.com";
      }
    }

    return redirect(`/auth/login?shop=${encodeURIComponent(shopDomain)}`);
  }

  return null;
};

export default function Dashboard() {
  const { user } = useLoaderData();
  const subscription = user.subscription;
  const stores = user.stores || [];

  const isActive = subscription?.status === "active";
  const plan = subscription?.plan || "starter";
  const storeLimit = subscription?.storeLimit || 1;

  const planLabels = {
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  const statusLabels = {
    inactive: "Inactive",
    active: "Active",
    cancelled: "Cancelled",
    past_due: "Past Due",
    expired: "Expired",
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
        <Form method="post" action="/logout" style={{ marginLeft: "auto" }}>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "1px solid #ddd",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Logout
          </button>
        </Form>
      </header>

      <section className={styles.legalPage}>
        <h1>Dashboard</h1>
        <p className={styles.lastUpdated}>{user.email}</p>

        <div style={{
          background: "#f9f9f9",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "32px",
        }}>
          <h2 style={{ marginTop: 0 }}>Subscription</h2>
          <div style={{ display: "grid", gap: "12px" }}>
            <div>
              <strong>Status:</strong>{" "}
              <span style={{
                color: isActive ? "#2ecc5f" : "#e53e3e",
                fontWeight: "600",
              }}>
                {statusLabels[subscription?.status] || "Inactive"}
              </span>
            </div>
            <div>
              <strong>Plan:</strong> {planLabels[plan]}
            </div>
            <div>
              <strong>Stores:</strong> {stores.length} / {storeLimit}
            </div>
          </div>
        </div>

        {!isActive && (
          <div style={{
            background: "#fffbeb",
            border: "1px solid #fbbf24",
            padding: "24px",
            borderRadius: "12px",
            marginBottom: "32px",
          }}>
            <h2 style={{ marginTop: 0, color: "#92400e" }}>Complete Your Purchase</h2>
            <p style={{ color: "#92400e", marginBottom: "16px" }}>
              Your subscription is inactive. Complete payment to start using Coupon Pulse.
            </p>
            <a
              href={`/checkout?plan=${plan}`}
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "#2ecc5f",
                color: "#fff",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: "700",
              }}
            >
              Continue to Checkout
            </a>
          </div>
        )}

        {isActive && (
          <div style={{
            background: "#f0fdf4",
            border: "1px solid #2ecc5f",
            padding: "24px",
            borderRadius: "12px",
            marginBottom: "32px",
          }}>
            <h2 style={{ marginTop: 0 }}>Connect Shopify Store</h2>
            {stores.length >= storeLimit ? (
              <p style={{ color: "#666" }}>
                You've reached your store limit ({storeLimit} stores).
                Upgrade your plan to connect more stores.
              </p>
            ) : (
              <Form method="post">
                <input type="hidden" name="intent" value="install-store" />
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: "600" }}>
                    Shopify Store URL
                  </label>
                  <input
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com"
                    required
                    style={{
                      width: "100%",
                      maxWidth: "400px",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: "12px 24px",
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "1rem",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Install Shopify Store
                </button>
              </Form>
            )}
          </div>
        )}

        {stores.length > 0 && (
          <div>
            <h2>Connected Stores</h2>
            <div style={{ display: "grid", gap: "12px" }}>
              {stores.map((store) => (
                <div
                  key={store.id}
                  style={{
                    padding: "16px",
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: "600" }}>{store.shop}</span>
                  <span style={{
                    fontSize: "0.85rem",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    background: store.status === "active" ? "#d1fae5" : "#f3f4f6",
                    color: store.status === "active" ? "#065f46" : "#6b7280",
                  }}>
                    {store.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span>Coupon Pulse</span>
          <span>Smart discount timing for Shopify stores.</span>
        </div>
        <div className={styles.footerLinks}>
          <a href="/about">About</a>
          <a href="/faq">FAQ</a>
          <a href="/terms-of-service">Terms</a>
          <a href="/refund-policy">Refunds</a>
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a>
        </div>
      </footer>
    </main>
  );
}
