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
    <main className={`${styles.page} ${styles.publicPage}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <div className={styles.authWrapper}>
        <div className={styles.authCard}>
          <h1>Welcome back</h1>
          <p className={styles.authSubtitle}>
            Sign in to your Coupon Pulse account
          </p>

          <Form method="post">
            {actionData?.error && (
              <div className={styles.authError}>{actionData.error}</div>
            )}

            <label>
              <span className={styles.authLabel}>Email</span>
              <input type="email" name="email" required />
            </label>

            <label>
              <span className={styles.authLabel}>Password</span>
              <input type="password" name="password" required />
            </label>

            <button type="submit" className={styles.authButton}>
              Login
            </button>
          </Form>

          <p className={styles.authFooter}>
            Don't have an account? <a href="/register">Register</a>
          </p>
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
