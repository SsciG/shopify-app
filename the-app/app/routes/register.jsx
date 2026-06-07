import { Form, useActionData, useSearchParams } from "react-router";
import { hashPassword, createUserSession, getUser } from "../auth.server";
import prisma from "../db.server";
import { redirect } from "react-router";
import styles from "./_index/styles.module.css";

const PLAN_LIMITS = {
  starter: 1,
  pro: 5,
  enterprise: 10,
};

export const meta = () => {
  return [
    { title: "Register - Coupon Pulse" },
    { name: "description", content: "Create your Coupon Pulse account" },
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
  const confirmPassword = formData.get("confirmPassword")?.toString();
  const plan = formData.get("plan")?.toString() || "starter";

  const errors = {};

  if (!email || !email.includes("@")) {
    errors.email = "Valid email is required";
  }

  if (!password || password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  if (!["starter", "pro", "enterprise"].includes(plan)) {
    errors.plan = "Invalid plan selected";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { errors: { email: "An account with this email already exists" } };
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      subscription: {
        create: {
          plan,
          status: "inactive",
          storeLimit: PLAN_LIMITS[plan],
        },
      },
    },
  });

  return createUserSession(user.id, "/dashboard");
};

export default function Register() {
  const actionData = useActionData();
  const [searchParams] = useSearchParams();
  const plan = searchParams.get("plan") || "starter";

  const planLabels = {
    starter: "Starter - $4.99/mo",
    pro: "Pro - $39.99/mo",
    enterprise: "Enterprise - $49.99/mo",
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <section className={styles.legalPage}>
        <h1>Create Account</h1>
        <p className={styles.lastUpdated}>
          Selected plan: <strong>{planLabels[plan] || planLabels.starter}</strong>
        </p>

        <Form method="post" style={{ maxWidth: "400px" }}>
          <input type="hidden" name="plan" value={plan} />

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
            {actionData?.errors?.email && (
              <p style={{ color: "#e53e3e", marginTop: "6px", fontSize: "0.9rem" }}>
                {actionData.errors.email}
              </p>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "1rem",
              }}
            />
            {actionData?.errors?.password && (
              <p style={{ color: "#e53e3e", marginTop: "6px", fontSize: "0.9rem" }}>
                {actionData.errors.password}
              </p>
            )}
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "1rem",
              }}
            />
            {actionData?.errors?.confirmPassword && (
              <p style={{ color: "#e53e3e", marginTop: "6px", fontSize: "0.9rem" }}>
                {actionData.errors.confirmPassword}
              </p>
            )}
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
            Create Account
          </button>

          <p style={{ marginTop: "20px", textAlign: "center", color: "#666" }}>
            Already have an account? <a href="/login" style={{ color: "#2ecc5f" }}>Login</a>
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
          <a href="/privacy-policy">Privacy</a>
          <a href="/refund-policy">Refunds</a>
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a>
        </div>
      </footer>
    </main>
  );
}
