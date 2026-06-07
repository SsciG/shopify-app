import styles from "./_index/styles.module.css";

export const meta = () => {
  return [
    { title: "FAQ - Coupon Pulse" },
    { name: "description", content: "Frequently Asked Questions about Coupon Pulse" },
  ];
};

export default function FAQ() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>
      </header>

      <section className={styles.legalPage}>
        <h1>Frequently Asked Questions</h1>
        <p className={styles.lastUpdated}>Everything you need to know about Coupon Pulse</p>

        <h2>How does Coupon Pulse detect hesitation?</h2>
        <p>
          We track multiple behavioral signals including exit intent, scroll depth, time on page,
          mouse movements, and product comparison patterns. Our algorithm combines these signals
          to identify when a shopper is genuinely hesitating versus actively browsing.
        </p>

        <h2>Will this annoy my customers with popups?</h2>
        <p>
          No. Unlike aggressive popup tools, Coupon Pulse only shows offers at the precise moment
          when a customer is likely to leave without purchasing. Engaged shoppers never see the
          popup, keeping your store experience clean and professional.
        </p>

        <h2>How long does setup take?</h2>
        <p>
          Most merchants are up and running in under 5 minutes. Simply install the app, configure
          your discount settings, and activate. No coding or theme modifications required.
        </p>

        <h2>Can I customize the discount amounts?</h2>
        <p>
          Absolutely. You have full control over discount percentages, minimum cart values, and
          can even set per-product overrides for items where you want different discount levels.
        </p>

        <h2>Does it work with all Shopify themes?</h2>
        <p>
          Yes. Coupon Pulse is designed to work seamlessly with any Shopify theme, including
          custom themes and headless setups using the Storefront API.
        </p>

        <h2>What's the difference between the plans?</h2>
        <p>
          Our plans differ by the number of stores you can connect:
        </p>
        <ul>
          <li><strong>Starter ($4.99/mo):</strong> Perfect for single store owners</li>
          <li><strong>Pro ($39.99/mo):</strong> Up to 5 stores with advanced analytics</li>
          <li><strong>Enterprise ($49.99/mo):</strong> Up to 10 stores with priority support</li>
        </ul>

        <h2>Can I track how well it's working?</h2>
        <p>
          Yes. Your dashboard includes analytics showing popup impressions, conversion rates,
          recovered sales value, and detailed insights on which products benefit most from
          behavior-triggered discounts.
        </p>

        <h2>Is there a free trial?</h2>
        <p>
          We offer a 7-day satisfaction guarantee. If Coupon Pulse isn't right for your store,
          contact us within 7 days for a full refund.
        </p>

        <h2>How do I cancel my subscription?</h2>
        <p>
          You can cancel anytime from your dashboard. Your access continues until the end of
          your current billing period, and you won't be charged again.
        </p>

        <h2>Do the coupon codes expire?</h2>
        <p>
          Yes. Each coupon code is unique and time-limited, creating genuine urgency. You
          control the expiration time (default is 15 minutes) to encourage immediate action
          without training shoppers to always wait for discounts.
        </p>

        <h2>Still have questions?</h2>
        <p>
          Contact our support team at{" "}
          <a href="mailto:support@couponpulse.co">support@couponpulse.co</a> and we'll get
          back to you within 24 hours.
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
