import { Form, useActionData } from "react-router";
import { verifyPassword, createUserSession, getUser } from "../auth.server";
import prisma from "../db.server";
import { redirect } from "react-router";
import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "Login - Coupon Pulse" },
    { name: "description", content: "Login to your Coupon Pulse account" },
  ];
};

export const loader = async ({ request }) => {
  const user = await getUser(request);
  if (user) {
    return redirect("/dashboard");
  }
  return null;
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return { error: "Invalid email or password" };
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    return { error: "Invalid email or password" };
  }

  return createUserSession(user.id, "/dashboard");
};

export default function Login() {
  const actionData = useActionData();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <section className={styles.legalPage}>
        <h1>Login</h1>
        <p className={styles.lastUpdated}>Welcome back to Coupon Pulse</p>

        <Form method="post" style={{ maxWidth: "400px" }}>
          {actionData?.error && (
            <p style={{
              color: "#e53e3e",
              marginBottom: "20px",
              padding: "12px",
              background: "#fed7d7",
              borderRadius: "8px",
            }}>
              {actionData.error}
            </p>
          )}

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "1rem",
              }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              style={{
                width: "100%",
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
              width: "100%",
              padding: "14px",
              background: "#2ecc5f",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "1rem",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Login
          </button>

          <p style={{ marginTop: "20px", textAlign: "center", color: "#666" }}>
            Don't have an account? <a href="/register" style={{ color: "#2ecc5f" }}>Register</a>
          </p>
        </Form>
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
