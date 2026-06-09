import { Form, useActionData, useLoaderData } from "react-router";
import { getLicensesByEmail } from "../lib/licensing.server";
import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "License Lookup - Coupon Pulse" },
    { name: "description", content: "Find your Coupon Pulse license key" },
  ];
};

export const loader = async () => {
  return { appUrl: process.env.SHOPIFY_APP_URL || "https://couponpulse.co" };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString().trim().toLowerCase();

  if (!email) {
    return { error: "Email is required" };
  }

  const licenses = await getLicensesByEmail(email);

  if (licenses.length === 0) {
    return { error: "No licenses found for this email. Make sure you're using the same email from your jewda purchase." };
  }

  return { licenses, email };
};

export default function LicenseLookup() {
  const { appUrl } = useLoaderData();
  const actionData = useActionData();

  return (
    <main className={`${styles.page} ${styles.publicPage}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <div className={styles.authWrapper}>
        <div className={styles.authCard}>
          <h1 style={{ fontSize: "1.8rem", fontWeight: "900", marginBottom: "8px", textAlign: "center" }}>
            License Lookup
          </h1>
          <p style={{ textAlign: "center", color: "#666", marginBottom: "24px" }}>
            Enter the email you used to purchase Coupon Pulse
          </p>

          <Form method="post">
            {actionData?.error && (
              <div style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                color: "#dc2626",
                fontSize: "0.9rem"
              }}>
                {actionData.error}
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label className={styles.authLabel}>Email Address</label>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                required
                className={styles.authInput}
              />
            </div>

            <button type="submit" className={styles.authButton}>
              Find My License
            </button>
          </Form>

          {actionData?.licenses && (
            <div style={{ marginTop: "24px" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "16px" }}>
                Your Licenses
              </h2>
              {actionData.licenses.map((license) => (
                <div
                  key={license.id}
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontWeight: "600", textTransform: "capitalize" }}>{license.plan} Plan</span>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      background: license.status === "active" ? "#dcfce7" : "#fef2f2",
                      color: license.status === "active" ? "#166534" : "#dc2626",
                    }}>
                      {license.status}
                    </span>
                  </div>

                  <div style={{
                    background: "#fff",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    padding: "12px",
                    fontFamily: "monospace",
                    fontSize: "1.1rem",
                    fontWeight: "700",
                    textAlign: "center",
                    letterSpacing: "2px",
                    marginBottom: "12px",
                  }}>
                    {license.key}
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "12px" }}>
                    Stores: {license.shops.filter(s => s.active).length} / {license.maxStores}
                  </div>

                  <a
                    href={`${appUrl}/install?license=${license.key}`}
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: "10px 16px",
                      background: "#2a5a36",
                      color: "#fff",
                      borderRadius: "8px",
                      textDecoration: "none",
                      fontWeight: "600",
                    }}
                  >
                    Install on a Shopify Store
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span>Coupon Pulse</span>
        </div>
        <div className={styles.footerLinks}>
          <a href="/">Home</a>
          <a href="mailto:support@couponpulse.co">Support</a>
        </div>
      </footer>
    </main>
  );
}
