import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "Terms of Service - Coupon Pulse" },
    { name: "description", content: "Terms of Service for Coupon Pulse" },
  ];
};

export default function TermsOfService() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <section className={styles.legalPage}>
        <h1>Terms of Service</h1>
        <p className={styles.lastUpdated}>Last updated: June 7, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Coupon Pulse ("Service"), you agree to be bound by these Terms of Service.
          If you do not agree to these terms, do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Coupon Pulse is a Shopify application that displays smart, behavior-based discount popups
          to help merchants recover hesitant shoppers and increase conversions.
        </p>

        <h2>3. Account Registration</h2>
        <p>
          To use the Service, you must create an account and provide accurate information.
          You are responsible for maintaining the security of your account credentials.
          You must notify us immediately of any unauthorized access to your account.
        </p>

        <h2>4. Subscription and Payment</h2>
        <p>
          The Service is offered on a subscription basis. By subscribing, you agree to pay the
          applicable fees for your chosen plan. Subscriptions are billed monthly and will
          automatically renew unless cancelled.
        </p>
        <ul>
          <li><strong>Starter:</strong> $4.99/month - 1 Shopify store</li>
          <li><strong>Pro:</strong> $39.99/month - Up to 5 Shopify stores</li>
          <li><strong>Enterprise:</strong> $49.99/month - Up to 10 Shopify stores</li>
        </ul>

        <h2>5. Cancellation</h2>
        <p>
          You may cancel your subscription at any time from your dashboard. Upon cancellation,
          you will retain access until the end of your current billing period. No partial
          refunds are provided for unused time within a billing cycle.
        </p>

        <h2>6. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Interfere with the proper functioning of the Service</li>
          <li>Resell or redistribute the Service without permission</li>
          <li>Use the Service to send spam or misleading content</li>
        </ul>

        <h2>7. Intellectual Property</h2>
        <p>
          The Service, including all content, features, and functionality, is owned by Coupon Pulse
          and is protected by copyright, trademark, and other intellectual property laws.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Coupon Pulse shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, including loss of profits, data,
          or business opportunities, arising from your use of the Service.
        </p>

        <h2>9. Disclaimer of Warranties</h2>
        <p>
          The Service is provided "as is" without warranties of any kind, either express or implied.
          We do not guarantee that the Service will be uninterrupted, error-free, or secure.
        </p>

        <h2>10. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Coupon Pulse from any claims, damages, or expenses
          arising from your use of the Service or violation of these Terms.
        </p>

        <h2>11. Modifications to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. We will notify users of material
          changes via email or through the Service. Continued use after changes constitutes acceptance.
        </p>

        <h2>12. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with applicable laws,
          without regard to conflict of law principles.
        </p>

        <h2>13. Contact</h2>
        <p>
          For questions about these Terms, contact us at{" "}
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a>
        </p>
      </section>

      <footer className={styles.footer}>
        <span>Coupon Pulse</span>
        <span>Smart discount timing for Shopify stores.</span>
      </footer>
    </main>
  );
}
