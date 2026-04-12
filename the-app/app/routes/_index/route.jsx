import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    // Has shop param - redirect to app (will trigger OAuth if needed)
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

export default function App() {
  const { showForm } = useLoaderData();
return (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        "radial-gradient(circle at top left, #1f2937 0%, #111827 35%, #f3f4f6 35%, #f3f4f6 100%)",
      padding: "32px",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.1fr 0.9fr",
        maxWidth: "1120px",
        width: "100%",
        background: "#ffffff",
        borderRadius: "24px",
        overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.18)",
      }}
    >
      <div
        style={{
          padding: "56px 48px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: "999px",
            background: "#eef2ff",
            color: "#4338ca",
            fontSize: "13px",
            fontWeight: "700",
            marginBottom: "18px",
            width: "fit-content",
          }}
        >
          Built for Shopify growth
        </div>

<<<<<<< HEAD
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
              <h2 className={styles.installTitle}>Install Nudge on Your Store</h2>
              <Form className={styles.form} method="post" action="/auth/login">
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
                  Install Free
                </button>
              </Form>
              <p className={styles.installHint}>Free to install. No credit card required.</p>
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
            <Form className={styles.ctaForm} method="post" action="/auth/login">
              <input
                className={styles.ctaInput}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                required
              />
              <button className={styles.ctaButton} type="submit">
                Get Started Free
              </button>
            </Form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <p className={styles.footerText}>Nudge - Smart discount timing for Shopify stores</p>
=======
        <h1
          style={{
            fontSize: "44px",
            lineHeight: "1.05",
            margin: "0 0 18px 0",
            color: "#111827",
            fontWeight: "800",
            letterSpacing: "-1px",
          }}
        >
          A short heading about [your app]
        </h1>

        <p
          style={{
            fontSize: "18px",
            lineHeight: "1.6",
            color: "#4b5563",
            margin: "0 0 28px 0",
            maxWidth: "560px",
          }}
        >
          A tagline about [your app] that describes your value proposition.
        </p>

        <div
          style={{
            display: "flex",
            gap: "28px",
            marginBottom: "28px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: "#111827" }}>+18%</div>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Potential lift in conversions</div>
          </div>
          <div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: "#111827" }}>24/7</div>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Behavior-based optimization</div>
          </div>
          <div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: "#111827" }}>A/B</div>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Test and learn automatically</div>
          </div>
        </div>

        {showForm && (
          <Form method="post" style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "520px" }}>
            <input
              type="text"
              name="shop"
              placeholder="my-shop-domain.myshopify.com"
              style={{
                padding: "16px 18px",
                borderRadius: "14px",
                border: "1px solid #d1d5db",
                fontSize: "15px",
                outline: "none",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
              }}
            />

            <button
              type="submit"
              style={{
                padding: "16px 18px",
                borderRadius: "14px",
                border: "none",
                background: "linear-gradient(135deg, #111827 0%, #4338ca 100%)",
                color: "#fff",
                fontWeight: "700",
                fontSize: "15px",
                cursor: "pointer",
                boxShadow: "0 12px 24px rgba(67,56,202,0.25)",
              }}
            >
              Log in
            </button>
          </Form>
        )}
      </div>

      <div
        style={{
          padding: "56px 42px",
          background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "24px",
            right: "24px",
            width: "120px",
            height: "120px",
            borderRadius: "999px",
            background: "rgba(99,102,241,0.18)",
            filter: "blur(8px)",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "1.2px",
              color: "#a5b4fc",
              fontWeight: "700",
              marginBottom: "18px",
            }}
          >
            Why merchants install it
          </div>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <li
              style={{
                padding: "18px 18px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <strong style={{ display: "block", marginBottom: "6px", fontSize: "18px" }}>
                Product feature
              </strong>
              <span style={{ color: "#d1d5db", lineHeight: "1.6" }}>
                Some detail about your feature and its benefit to your customer.
              </span>
            </li>

            <li
              style={{
                padding: "18px 18px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <strong style={{ display: "block", marginBottom: "6px", fontSize: "18px" }}>
                Product feature
              </strong>
              <span style={{ color: "#d1d5db", lineHeight: "1.6" }}>
                Some detail about your feature and its benefit to your customer.
              </span>
            </li>

            <li
              style={{
                padding: "18px 18px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <strong style={{ display: "block", marginBottom: "6px", fontSize: "18px" }}>
                Product feature
              </strong>
              <span style={{ color: "#d1d5db", lineHeight: "1.6" }}>
                Some detail about your feature and its benefit to your customer.
              </span>
            </li>
          </ul>
        </div>
>>>>>>> 0ff5b86 (Update landing page with Nudge-specific content)
      </div>
    </div>
  </div>
);

}
