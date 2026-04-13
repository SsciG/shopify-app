import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    // Has shop param - redirect to app (will trigger OAuth if needed)
    // Preserve plan param so it's available after OAuth
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Check if we're embedded in Shopify admin (has embedded param)
  const embedded = url.searchParams.get("embedded");
  if (embedded === "1") {
    // Embedded but no shop - something is wrong, show error
    throw new Response("Missing shop parameter", { status: 400 });
  }

  return { showForm: Boolean(login) };
};

// Handle form submission - set cookie with plan and redirect to auth/login
export const action = async ({ request }) => {
  const formData = await request.formData();
  const shop = formData.get("shop");
  const plan = formData.get("plan") || "pro";

  if (!shop) {
    return { error: "Shop URL is required" };
  }

  // Normalize shop domain
  let shopDomain = shop.toString().trim().toLowerCase();
  // Handle case where user types just store name without domain
  if (!shopDomain.includes(".")) {
    shopDomain = shopDomain + ".myshopify.com";
  } else if (!shopDomain.includes(".myshopify.com")) {
    // If they typed a custom domain, try to use it as-is or append myshopify.com
    shopDomain = shopDomain.replace(/^https?:\/\//, "").split("/")[0];
    if (!shopDomain.endsWith(".myshopify.com")) {
      shopDomain = shopDomain + ".myshopify.com";
    }
  }

  // Set cookie with pending plan (will be read after OAuth completes in app.jsx)
  // Then redirect to auth/login to start OAuth
  return redirect(`/auth/login?shop=${encodeURIComponent(shopDomain)}`, {
    headers: {
      "Set-Cookie": `pending_plan=${plan}; Path=/; Max-Age=3600; SameSite=Lax`
    }
  });
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.page}>
      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.logo}>💡</div>
          <h1 className={styles.heading}>Turn Hesitant Shoppers Into Buyers</h1>
          <p className={styles.subheading}>
            Nudge detects when visitors are about to leave and shows them a personalized discount at the perfect moment to convert.
          </p>

          {showForm && (
            <div className={styles.installCard}>
              <h2 className={styles.installTitle}>Choose Your Plan</h2>
              <Form className={styles.form} method="post">
                <div className={styles.planSelector}>
                  <label className={styles.planOption}>
                    <input type="radio" name="plan" value="starter" />
                    <div className={styles.planCard}>
                      <div className={styles.planName}>Starter</div>
                      <div className={styles.planPrice}>$4.99<span>/mo</span></div>
                      <div className={styles.planDesc}>All triggers + basic analytics</div>
                    </div>
                  </label>
                  <label className={styles.planOption}>
                    <input type="radio" name="plan" value="pro" defaultChecked />
                    <div className={styles.planCard + ' ' + styles.planPopular}>
                      <div className={styles.planBadge}>MOST POPULAR</div>
                      <div className={styles.planName}>Pro</div>
                      <div className={styles.planPrice}>$39.99<span>/mo</span></div>
                      <div className={styles.planDesc}>A/B testing + AI optimization</div>
                    </div>
                  </label>
                  <label className={styles.planOption}>
                    <input type="radio" name="plan" value="enterprise" />
                    <div className={styles.planCard}>
                      <div className={styles.planName}>Enterprise</div>
                      <div className={styles.planPrice}>$49.99<span>/mo</span></div>
                      <div className={styles.planDesc}>Dedicated support + custom integrations</div>
                    </div>
                  </label>
                </div>
                <label className={styles.label}>
                  <span>Your Shopify store URL</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="my-store.myshopify.com"
                    required
                  />
                </label>
                <button className={styles.button} type="submit">
                  Install & Subscribe
                </button>
              </Form>
              <p className={styles.installHint}>Billed monthly through Shopify. Cancel anytime.</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className={styles.statsSection}>
        <div className={styles.statsContainer}>
          <div className={styles.stat}>
            <div className={styles.statValue}>15-25%</div>
            <div className={styles.statLabel}>Average conversion lift</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>4 sec</div>
            <div className={styles.statLabel}>Perfect timing detection</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>100%</div>
            <div className={styles.statLabel}>Automated & hands-free</div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <p className={styles.sectionSubtitle}>Intelligent discount timing that actually converts</p>

          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Detect Hesitation</h3>
              <p className={styles.stepDesc}>
                Tracks time on page, scroll depth, variant comparisons, and exit intent to identify shoppers who need a nudge.
              </p>
            </div>

            <div className={styles.stepArrow}>→</div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Perfect Timing</h3>
              <p className={styles.stepDesc}>
                AI learns optimal delay for your store. Shows banner only when user hasn't interacted recently.
              </p>
            </div>

            <div className={styles.stepArrow}>→</div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Convert</h3>
              <p className={styles.stepDesc}>
                Creates unique, auto-expiring discount codes on-the-fly. One-time use, tied to specific product.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className={styles.featuresSection}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Everything You Need</h2>
          <ul className={styles.featureList}>
            <li className={styles.feature}>
              <strong>🎯 Smart Behavioral Detection</strong> - Tracks exit intent, scroll patterns, and engagement to identify the perfect moment
            </li>
            <li className={styles.feature}>
              <strong>🤖 AI-Optimized Timing</strong> - Machine learning finds the best delay and discount percentage for your store
            </li>
            <li className={styles.feature}>
              <strong>🎫 Auto-Expiring Discounts</strong> - Creates unique, one-time codes that expire automatically to prevent abuse
            </li>
            <li className={styles.feature}>
              <strong>📊 Built-in A/B Testing</strong> - 10% control group measures true lift so you know exact ROI
            </li>
            <li className={styles.feature}>
              <strong>⚙️ Per-Product Overrides</strong> - Customize discount % and timing for specific products
            </li>
            <li className={styles.feature}>
              <strong>🚀 Works on All Themes</strong> - No code required, compatible with any Shopify theme
            </li>
          </ul>
        </div>
      </div>

      {/* CTA Section */}
      {showForm && (
        <div className={styles.ctaSection}>
          <div className={styles.container}>
            <h2 className={styles.ctaTitle}>Ready to Boost Your Conversions?</h2>
            <p className={styles.ctaText}>Join stores using Nudge to recover abandoned sessions</p>
            <Form className={styles.ctaForm} method="post">
              <input type="hidden" name="plan" value="pro" />
              <input
                className={styles.ctaInput}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                required
              />
              <button className={styles.ctaButton} type="submit">
                Get Started
              </button>
            </Form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <p className={styles.footerText}>Nudge - Smart discount timing for Shopify stores</p>
      </div>
    </div>
  );
}
