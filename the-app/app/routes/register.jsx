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
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  const planPrices = {
    starter: "$4.99/mo",
    pro: "$39.99/mo",
    enterprise: "$49.99/mo",
  };

  return (
    <main className={`${styles.page} ${styles.publicPage}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <div className={styles.authWrapper}>
        <div className={styles.authCard}>
          <h1>Create your account</h1>
          <p className={styles.authSubtitle}>
            Start with <span className={styles.planBadge}>{planLabels[plan]} {planPrices[plan]}</span>
          </p>

          <Form method="post">
            <input type="hidden" name="plan" value={plan} />

            {actionData?.errors?.email && (
              <div className={styles.authError}>{actionData.errors.email}</div>
            )}

            <label>
              <span className={styles.authLabel}>Email</span>
              <input type="email" name="email" required />
            </label>

            <label>
              <span className={styles.authLabel}>Password</span>
              <input type="password" name="password" required minLength={8} />
              {actionData?.errors?.password && (
                <div className={styles.authError} style={{ marginTop: "8px" }}>
                  {actionData.errors.password}
                </div>
              )}
            </label>

            <label>
              <span className={styles.authLabel}>Confirm Password</span>
              <input type="password" name="confirmPassword" required />
              {actionData?.errors?.confirmPassword && (
                <div className={styles.authError} style={{ marginTop: "8px" }}>
                  {actionData.errors.confirmPassword}
                </div>
              )}
            </label>

            <button type="submit" className={styles.authButton}>
              Create Account
            </button>
          </Form>

          <p className={styles.authFooter}>
            Already have an account? <a href="/login">Login</a>
          </p>

          <p className={styles.authTrust}>
            Secure checkout after account creation
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
