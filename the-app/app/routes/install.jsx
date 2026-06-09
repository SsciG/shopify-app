import { Form, useLoaderData, useActionData, redirect } from "react-router";
import { getLicenseByKey } from "../lib/licensing.server";
import prisma from "../db.server";
import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "Install Coupon Pulse" },
    { name: "description", content: "Install Coupon Pulse on your Shopify store" },
  ];
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const licenseKey = url.searchParams.get("license");

  if (!licenseKey) {
    return { error: "No license key provided. Please use the install link from your purchase confirmation." };
  }

  const license = await getLicenseByKey(licenseKey);

  if (!license) {
    return { error: "Invalid license key. Please check your purchase confirmation or use the license lookup page.", licenseKey };
  }

  if (license.status !== "active") {
    return { error: `License is ${license.status}. Please renew your subscription to continue.`, license };
  }

  const activeShops = license.shops.filter(s => s.active).length;
  const slotsAvailable = license.maxStores - activeShops;

  if (slotsAvailable <= 0) {
    return {
      error: `You've reached your store limit (${license.maxStores} stores on ${license.plan} plan). Upgrade your plan or uninstall from another store.`,
      license,
      activeShops,
    };
  }

  return { license, activeShops, slotsAvailable };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const shop = formData.get("shop")?.toString().trim().toLowerCase();
  const licenseKey = formData.get("licenseKey")?.toString();

  if (!shop) {
    return { error: "Store URL is required" };
  }

  if (!licenseKey) {
    return { error: "License key is missing" };
  }

  // Normalize shop domain
  let shopDomain = shop;
  if (!shopDomain.includes(".")) {
    shopDomain = shopDomain + ".myshopify.com";
  } else if (!shopDomain.includes(".myshopify.com")) {
    shopDomain = shopDomain.replace(/^https?:\/\//, "").split("/")[0];
    if (!shopDomain.endsWith(".myshopify.com")) {
      shopDomain = shopDomain + ".myshopify.com";
    }
  }

  // Store the pending install in database (survives OAuth redirect)
  await prisma.pendingInstall.upsert({
    where: { shopDomain },
    update: { licenseKey, createdAt: new Date() },
    create: { shopDomain, licenseKey },
  });

  // Redirect to Shopify OAuth
  return redirect(`/auth/login?shop=${encodeURIComponent(shopDomain)}`);
};

export default function Install() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const error = actionData?.error || loaderData?.error;
  const license = loaderData?.license;

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
            Install Coupon Pulse
          </h1>

          {error && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "16px",
              color: "#dc2626",
            }}>
              {error}
              {!license && (
                <div style={{ marginTop: "12px" }}>
                  <a href="/license/lookup" style={{ color: "#2a5a36", fontWeight: "600" }}>
                    Look up your license
                  </a>
                </div>
              )}
            </div>
          )}

          {license && !error && (
            <>
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "20px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "600", textTransform: "capitalize" }}>{license.plan} Plan</span>
                  <span style={{ color: "#166534", fontWeight: "600" }}>
                    {loaderData.slotsAvailable} slot{loaderData.slotsAvailable !== 1 ? 's' : ''} available
                  </span>
                </div>
                <div style={{ fontSize: "0.9rem", color: "#666" }}>
                  {license.email}
                </div>
              </div>

              <Form method="post">
                <input type="hidden" name="licenseKey" value={license.key} />

                <div style={{ marginBottom: "16px" }}>
                  <label className={styles.authLabel}>Shopify Store URL</label>
                  <input
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com"
                    required
                    className={styles.authInput}
                  />
                </div>

                <button type="submit" className={styles.authButton}>
                  Install App
                </button>
              </Form>
            </>
          )}

          {license && error && license.status === "active" && (
            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <p style={{ color: "#666", marginBottom: "12px" }}>
                Currently installed on:
              </p>
              {license.shops.filter(s => s.active).map(shop => (
                <div key={shop.id} style={{
                  background: "#f9f9f9",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  marginBottom: "6px",
                  fontSize: "0.9rem",
                }}>
                  {shop.shopDomain}
                </div>
              ))}
              <p style={{ marginTop: "16px", fontSize: "0.85rem", color: "#666" }}>
                Uninstall from one store to free up a slot, or{" "}
                <a href="https://jewda.myshopify.com" style={{ color: "#2a5a36", fontWeight: "600" }}>
                  upgrade your plan
                </a>
              </p>
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
          <a href="/license/lookup">License Lookup</a>
        </div>
      </footer>
    </main>
  );
}
