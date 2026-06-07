import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "Refund Policy - Coupon Pulse" },
    { name: "description", content: "Refund Policy for Coupon Pulse" },
  ];
};

export default function RefundPolicy() {
  return (
    <main className={`${styles.page} ${styles.publicPage}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <section className={styles.legalPage}>
        <h1>Refund Policy</h1>
        <p className={styles.lastUpdated}>Last updated: June 7, 2026</p>

        <h2>Subscription-Based Service</h2>
        <p>
          Coupon Pulse is a subscription-based service billed monthly through your chosen payment provider.
          We want you to be completely satisfied with our service.
        </p>

        <h2>Cancellation</h2>
        <p>
          You may cancel your subscription at any time from your dashboard. Upon cancellation:
        </p>
        <ul>
          <li>You will retain full access to Coupon Pulse until the end of your current billing period</li>
          <li>No further charges will be made after cancellation</li>
          <li>Your data will be retained for 30 days after cancellation in case you decide to return</li>
        </ul>

        <h2>Refund Eligibility</h2>
        <p>
          We offer refunds under the following circumstances:
        </p>
        <ul>
          <li><strong>First 7 Days:</strong> If you cancel within 7 days of your initial subscription and have not used the service extensively, you are eligible for a full refund</li>
          <li><strong>Technical Issues:</strong> If you experience persistent technical issues that prevent you from using the service and our support team is unable to resolve them</li>
          <li><strong>Billing Errors:</strong> If you were charged incorrectly or multiple times by mistake</li>
        </ul>

        <h2>Non-Refundable Situations</h2>
        <p>
          Refunds are generally not provided in the following cases:
        </p>
        <ul>
          <li>After the 7-day initial period for change-of-mind cancellations</li>
          <li>Partial refunds for unused days within a billing cycle</li>
          <li>If your account was terminated due to violation of our Terms of Service</li>
          <li>If you simply forgot to cancel before the renewal date</li>
        </ul>

        <h2>How to Request a Refund</h2>
        <p>
          To request a refund, please contact our support team at{" "}
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a> with:
        </p>
        <ul>
          <li>Your account email address</li>
          <li>The reason for your refund request</li>
          <li>Any relevant details or documentation</li>
        </ul>
        <p>
          We aim to respond to all refund requests within 2-3 business days.
        </p>

        <h2>Refund Processing</h2>
        <p>
          Approved refunds will be processed within 5-10 business days. The refund will be credited
          to the original payment method used for the purchase.
        </p>

        <h2>Questions</h2>
        <p>
          If you have any questions about our refund policy, please contact us at{" "}
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a>
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
