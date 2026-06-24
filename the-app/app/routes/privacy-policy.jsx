import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "Privacy Policy - Coupon Pulse" },
    { name: "description", content: "Privacy Policy for Coupon Pulse" },
  ];
};

export default function PrivacyPolicy() {
  return (
    <main className={`${styles.page} ${styles.publicPage}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <section className={styles.legalPage}>
        <h1>Privacy Policy</h1>
        <p className={styles.lastUpdated}>Last updated: June 23, 2026</p>

        <p>
          Coupon Pulse ("we", "us", "the app") helps Shopify merchants show
          behavior-based discount offers to shoppers. This Privacy Policy explains
          what information the app accesses, how it is used, and the choices you
          have. By installing or using Coupon Pulse you agree to this policy.
        </p>

        <h2>Information We Collect</h2>
        <p>When you install Coupon Pulse on your Shopify store, we access and store:</p>
        <ul>
          <li><strong>Store information:</strong> your store domain, access token, and app/billing settings needed to run the app.</li>
          <li><strong>App configuration:</strong> the discount, timing, and override settings you choose inside the app.</li>
          <li><strong>Anonymous shopper events:</strong> on-site behavioral signals (such as time on page, scroll depth, and whether a discount banner was shown, clicked, or led to a purchase). These events are tied to an anonymous session identifier and are used only to optimize timing and measure performance.</li>
          <li><strong>Discount usage:</strong> the discount codes the app generates and whether they were used, for attribution and reporting.</li>
        </ul>
        <p>
          The app does not require shoppers to create accounts and does not
          intentionally collect names, emails, payment details, or other directly
          identifying personal information from your shoppers.
        </p>

        <h2>How We Use Information</h2>
        <ul>
          <li>To display and time discount banners on your storefront.</li>
          <li>To generate and track discount codes.</li>
          <li>To provide analytics on performance and conversion lift.</li>
          <li>To operate billing and maintain your subscription through Shopify.</li>
          <li>To provide support and improve the app.</li>
        </ul>

        <h2>How We Share Information</h2>
        <p>
          We do not sell your data. Information is processed only to operate the
          app and is shared with:
        </p>
        <ul>
          <li><strong>Shopify</strong>, to read and write the store resources required for the app to function (products, discounts, settings) and to handle billing.</li>
          <li><strong>Infrastructure providers</strong> that host the application and database on our behalf, under appropriate confidentiality obligations.</li>
        </ul>

        <h2>Data Retention</h2>
        <p>
          We retain store and event data for as long as the app is installed.
          When you uninstall the app, we delete or anonymize associated store data
          within 30 days, except where retention is required by law.
        </p>

        <h2>GDPR &amp; Data Requests</h2>
        <p>
          Coupon Pulse supports Shopify's mandatory privacy webhooks. We respond to
          Shopify's <code>customers/data_request</code>, <code>customers/redact</code>,
          and <code>shop/redact</code> requests to provide or delete data as required.
          Merchants and their customers may request access to, correction of, or
          deletion of their data by contacting us at the address below.
        </p>

        <h2>Cookies &amp; Tracking</h2>
        <p>
          The app uses a temporary, anonymous session identifier to coordinate
          banner timing and attribute discount usage. It is not used to build
          cross-site advertising profiles of shoppers.
        </p>

        <h2>Security</h2>
        <p>
          We use industry-standard measures to protect data in transit and at rest.
          No method of transmission or storage is completely secure, but we work to
          protect your information and limit access to it.
        </p>

        <h2>Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will
          be reflected by updating the "Last updated" date above.
        </p>

        <h2>Contact</h2>
        <p>
          If you have any questions about this Privacy Policy or your data, contact us at{" "}
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a>.
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
