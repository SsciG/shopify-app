import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "About Us - Coupon Pulse" },
    { name: "description", content: "About Coupon Pulse - Smart discount timing for Shopify stores" },
  ];
};

export default function About() {
  return (
    <main className={`${styles.page} ${styles.publicPage}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <section className={styles.legalPage}>
        <h1>About Coupon Pulse</h1>
        <p className={styles.lastUpdated}>Smart discount timing for Shopify stores</p>

        <h2>Our Mission</h2>
        <p>
          We believe that discounts should be strategic, not desperate. Coupon Pulse helps Shopify
          merchants recover hesitant shoppers by showing the right offer at the right moment -
          not with aggressive popups that annoy every visitor.
        </p>

        <h2>The Problem We Solve</h2>
        <p>
          Most Shopify stores lose potential customers who hesitate, compare products, or simply
          get distracted before completing their purchase. Traditional popups either appear too
          early (annoying engaged shoppers) or rely on exit-intent alone (missing the nuances of
          shopper behavior).
        </p>

        <h2>How We're Different</h2>
        <p>
          Coupon Pulse uses intelligent behavior detection to identify when a shopper is genuinely
          hesitating. We track multiple signals:
        </p>
        <ul>
          <li>Exit intent patterns</li>
          <li>Scroll depth and reading behavior</li>
          <li>Time spent comparing products</li>
          <li>Mouse movement and inactivity</li>
        </ul>
        <p>
          Only when these signals indicate genuine hesitation do we display a time-sensitive
          discount offer - keeping the shopping experience clean for everyone else.
        </p>

        <h2>Built for Merchants</h2>
        <p>
          We understand that margins matter. That's why Coupon Pulse gives you full control over:
        </p>
        <ul>
          <li>Which products receive discounts</li>
          <li>Discount percentages and limits</li>
          <li>Per-product overrides for high-margin items</li>
          <li>Analytics to track recovered sales</li>
        </ul>

        <h2>Contact Us</h2>
        <p>
          Have questions or feedback? We'd love to hear from you.
        </p>
        <p>
          Email: <a href="mailto:support@couponpulse.co">support@couponpulse.co</a>
        </p>
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
