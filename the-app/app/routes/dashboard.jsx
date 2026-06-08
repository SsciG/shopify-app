import { Form, useLoaderData, useActionData } from "react-router";
import { requireUser } from "../auth.server";
import { redirect } from "react-router";
import { useEffect } from "react";
import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "Dashboard - Coupon Pulse" },
    { name: "description", content: "Manage your Coupon Pulse subscription" },
  ];
};

export const loader = async ({ request }) => {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const checkoutSuccess = url.searchParams.get("checkout") === "success";
  const urlError = url.searchParams.get("error");

  // Map URL error codes to user-friendly messages
  const errorMessages = {
    subscription_required: "Active subscription required before installing a store",
    store_limit_reached: "Store limit reached. Upgrade your plan to connect more stores.",
  };

  const loaderError = urlError ? errorMessages[urlError] || urlError : null;

  return { user, checkoutSuccess, loaderError };
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

    // Backend enforcement: check subscription status
    const subscription = user.subscription;
    if (!subscription || subscription.status !== "active") {
      return { error: "Active subscription required before installing a store" };
    }

    // Backend enforcement: check store limit
    const stores = user.stores || [];
    const storeLimit = subscription.storeLimit || 1;
    const activeStores = stores.filter(
      (s) => s.status === "active" || s.status === "pending"
    ).length;

    if (activeStores >= storeLimit) {
      return { error: `Store limit reached. Your plan allows ${storeLimit} store(s).` };
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
  const { user, checkoutSuccess, loaderError } = useLoaderData();
  const actionData = useActionData();
  const subscription = user.subscription;
  const stores = user.stores || [];
  const error = actionData?.error || loaderError;

  const isActive = subscription?.status === "active";
  const plan = subscription?.plan || "starter";
  const storeLimit = subscription?.storeLimit || 1;
  const usedStores = stores.filter(
    (s) => s.status === "active" || s.status === "pending"
  ).length;
  const isPending = checkoutSuccess && !isActive;

  useEffect(() => {
    if (isPending) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isPending]);

  const planLabels = {
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  return (
    <main className={`${styles.page} ${styles.publicPage}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
        <Form method="post" action="/logout" style={{ marginLeft: "auto" }}>
          <button type="submit" className={styles.headerButton} style={{ background: "transparent", color: "#333", border: "1px solid #ddd" }}>
            Logout
          </button>
        </Form>
      </header>

      <div className={styles.authWrapper}>
        <div style={{ width: "100%", maxWidth: "600px" }}>

          <h1 style={{ fontSize: "2rem", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>
            Dashboard
          </h1>
          <p style={{ textAlign: "center", color: "#666", marginBottom: "32px" }}>
            {user.email}
          </p>

          {loaderError && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "24px",
              color: "#dc2626",
              textAlign: "center"
            }}>
              {loaderError}
            </div>
          )}

          <div className={styles.dashboardCard}>
            <h2>Subscription</h2>
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#666" }}>Status</span>
                <span className={`${styles.statusBadge} ${isActive ? styles.statusActive : styles.statusInactive}`}>
                  {isActive ? "Active" : subscription?.status === "past_due" ? "Past Due" : "Inactive"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#666" }}>Plan</span>
                <span style={{ fontWeight: "700" }}>{planLabels[plan]}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#666" }}>Stores</span>
                <span style={{ fontWeight: "700" }}>{usedStores} / {storeLimit}</span>
              </div>
            </div>
          </div>

          {isPending && (
            <div className={`${styles.dashboardAlert} ${styles.dashboardAlertInfo}`}>
              <h3 style={{ margin: "0 0 8px", color: "#1e40af", fontWeight: "800" }}>
                Payment Received
              </h3>
              <p style={{ margin: 0, color: "#1e40af" }}>
                Waiting for confirmation... This page will refresh automatically.
              </p>
            </div>
          )}

          {!isActive && !isPending && (
            <div className={`${styles.dashboardAlert} ${styles.dashboardAlertWarning}`}>
              <h3 style={{ margin: "0 0 8px", color: "#92400e", fontWeight: "800" }}>
                Complete Your Purchase
              </h3>
              <p style={{ margin: "0 0 16px", color: "#92400e" }}>
                Your subscription is inactive. Complete payment to start using Coupon Pulse.
              </p>
              <a
                href={`/checkout?plan=${plan}`}
                className={styles.authButton}
                style={{ display: "inline-block", width: "auto", padding: "12px 28px" }}
              >
                Continue to Checkout
              </a>
            </div>
          )}

          {isActive && (
            <div className={`${styles.dashboardAlert} ${styles.dashboardAlertSuccess}`}>
              <h3 style={{ margin: "0 0 12px", fontWeight: "800" }}>
                Connect Shopify Store
              </h3>
              {usedStores >= storeLimit ? (
                <p style={{ margin: 0, color: "#666" }}>
                  You've reached your store limit ({storeLimit} stores).
                  Upgrade your plan to connect more stores.
                </p>
              ) : (
                <Form method="post">
                  <input type="hidden" name="intent" value="install-store" />
                  {error && (
                    <div style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "8px",
                      padding: "12px",
                      marginBottom: "14px",
                      color: "#dc2626",
                      fontSize: "0.9rem"
                    }}>
                      {error}
                    </div>
                  )}
                  <div style={{ marginBottom: "14px" }}>
                    <label className={styles.authLabel} style={{ marginBottom: "8px", display: "block" }}>
                      Shopify Store URL
                    </label>
                    <input
                      type="text"
                      name="shop"
                      placeholder="your-store.myshopify.com"
                      required
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: "12px",
                        border: "2px solid #e8e1dc",
                        fontSize: "1rem",
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    className={styles.authButton}
                    style={{ width: "auto", padding: "12px 28px" }}
                  >
                    Install Shopify Store
                  </button>
                </Form>
              )}
            </div>
          )}

          {stores.length > 0 && (
            <div className={styles.dashboardCard}>
              <h2>Connected Stores</h2>
              <div style={{ display: "grid", gap: "10px" }}>
                {stores.map((store) => (
                  <div
                    key={store.id}
                    style={{
                      padding: "14px 16px",
                      background: "#f9f9f9",
                      borderRadius: "10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontWeight: "600" }}>{store.shop}</span>
                    <span className={`${styles.statusBadge} ${store.status === "active" ? styles.statusActive : styles.statusPending}`}>
                      {store.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span>Coupon Pulse</span>
          <span>Smart discount timing for Shopify stores.</span>
        </div>
        <div className={styles.footerLinks}>
          <a href="/about">About</a>
          <a href="/faq">FAQ</a>
          <a href="/terms-of-service">Terms</a>
          <a href="/privacy-policy">Privacy</a>
          <a href="/refund-policy">Refunds</a>
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a>
        </div>
      </footer>
    </main>
  );
}
