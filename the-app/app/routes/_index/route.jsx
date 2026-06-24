import { redirect } from "react-router";
import styles from "./styles.module.css";
import { useState, useEffect } from "react";

const chatQA = [
  {
    question: "How does Coupon Pulse detect hesitation?",
    answer: "We track multiple signals like exit intent, scroll depth, time on page, and mouse movements to detect when a shopper is hesitating or about to leave."
  },
  {
    question: "Will this annoy my customers with popups?",
    answer: "Not at all! Unlike aggressive popups, Coupon Pulse only shows offers at the right moment when a customer is genuinely hesitating, keeping the shopping experience clean."
  },
  {
    question: "How long does setup take?",
    answer: "Just a few minutes! Install the app, configure your discount settings, and you're ready to go. No coding required."
  },
  {
    question: "Can I customize the discount amounts?",
    answer: "Yes! You have full control over discount percentages, which products to include, and even set per-product overrides for maximum flexibility."
  },
  {
    question: "Does it work with all Shopify themes?",
    answer: "Absolutely! Coupon Pulse is designed to work seamlessly with any Shopify theme, including custom themes."
  },
  {
    question: "What's the difference between the plans?",
    answer: "Starter is perfect for single stores at $4.99/mo. Pro supports up to 5 stores at $39.99/mo with advanced features. Enterprise covers up to 10 stores at $49.99/mo."
  },
  {
    question: "Can I track how well it's working?",
    answer: "Yes! Our analytics dashboard shows you conversion rates, recovered sales, and detailed insights on how your discounts are performing."
  },
  {
    question: "Is there a free trial?",
    answer: "We offer a risk-free experience through Shopify's billing system. You can cancel anytime if it's not the right fit for your store."
  }
];

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: "bot", text: "Hi there! I'm here to help answer your questions about Coupon Pulse. What would you like to know?" }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const handleQuestionClick = (qa) => {
    setMessages(prev => [...prev, { type: "user", text: qa.question }]);
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { type: "bot", text: qa.answer }]);
    }, 800 + Math.random() * 700);
  };

  const getRandomQuestions = () => {
    const shuffled = [...chatQA].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  };

  const [suggestedQuestions, setSuggestedQuestions] = useState(chatQA.slice(0, 3));

  useEffect(() => {
    setIsMounted(true);
    setSuggestedQuestions(getRandomQuestions());
  }, []);

  useEffect(() => {
    if (isMounted && messages.length > 1) {
      setSuggestedQuestions(getRandomQuestions());
    }
  }, [messages, isMounted]);

  return (
    <div className={styles.chatWidget}>
      {isOpen && (
        <div className={styles.chatWindow}>
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderInfo}>
              <span className={styles.chatAvatar}>%</span>
              <div>
                <strong>Coupon Pulse Support</strong>
                <span className={styles.chatStatus}>Online</span>
              </div>
            </div>
            <button className={styles.chatClose} onClick={() => setIsOpen(false)}>×</button>
          </div>

          <div className={styles.chatMessages}>
            {messages.map((msg, i) => (
              <div key={i} className={msg.type === "bot" ? styles.chatBotMsg : styles.chatUserMsg}>
                {msg.text}
              </div>
            ))}
            {isTyping && (
              <div className={styles.chatBotMsg}>
                <span className={styles.typingIndicator}>
                  <span></span><span></span><span></span>
                </span>
              </div>
            )}
          </div>

          <div className={styles.chatSuggestions}>
            <p>Suggested questions:</p>
            {suggestedQuestions.map((qa, i) => (
              <button key={i} onClick={() => handleQuestionClick(qa)}>
                {qa.question}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className={styles.chatToggle} onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? "×" : "💬"}
      </button>
    </div>
  );
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const embedded = url.searchParams.get("embedded");
  if (embedded === "1") {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  return {};
};

export const action = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {};
};

export default function App() {

  const scrollToSection = (event, id) => {
    event.preventDefault();

    const section = document.getElementById(id);
    if (!section) return;

    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    window.history.pushState(null, "", `#${id}`);
  };


  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo.png" alt="Coupon Pulse" className={styles.headerLogo} />
        </a>

        <nav className={styles.nav}>
        <a href="#how" onClick={(event) => scrollToSection(event, "how")}>
          How it works
        </a>

        <a href="#features" onClick={(event) => scrollToSection(event, "features")}>
          Features
        </a>

        <a href="#install" onClick={(event) => scrollToSection(event, "install")}>
          Pricing
        </a>

        <a href="https://apps.shopify.com/coupon-pulse">
          Get the app
        </a>
      </nav>

      <a
        className={styles.headerButton}
        href="#install"
        onClick={(event) => scrollToSection(event, "install")}
      >
        Get Started
      </a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroOverlay} />

        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Shopify discount automation</p>

          <h1>Close More Sales Automatically</h1>

          <p className={styles.heroText}>
            Show smart, time-sensitive discounts to shoppers who are hesitating,
            leaving, or comparing products — before they abandon the store.
          </p>

          <div className={styles.heroActions}>
            <a
            className={styles.primaryButton}
            href="#install"
            onClick={(event) => {
              if (typeof window !== 'undefined' && window.fbq) {
                window.fbq('track', 'InitiateCheckout', {
                  content_name: 'Hero CTA Click'
                });
              }
              scrollToSection(event, "install");
            }}
          >
            Connect your Shopify store
          </a>

          <a
            className={styles.secondaryButton}
            href="#how"
            onClick={(event) => scrollToSection(event, "how")}
          >
            See how it works
          </a>
          </div>
        </div>
      </section>

      <section className={styles.problemSection}>
        <div className={styles.twoCol}>
          <div>
            <p className={styles.sectionKicker}>The problem</p>
            <h2>Most visitors leave before they buy.</h2>
            <p>
              Shoppers hesitate, compare products, scroll around, and often exit
              without purchasing. Generic popups are either too early, too
              aggressive, or too easy to ignore.
            </p>
          </div>

          <div className={styles.solutionCard}>
            <p className={styles.sectionKicker}>The solution</p>
            <h3>Coupon Pulse reacts at the right moment.</h3>
            <p>
              It watches shopper behavior and triggers a relevant discount only
              when the visitor shows signs of hesitation or exit intent.
            </p>
          </div>
        </div>
      </section>

      <section id="how" className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>How it works</p>
          <h2>Detect. Trigger. Convert.</h2>
        </div>

        <div className={styles.stepsGrid}>
          <article className={styles.stepCard}>
            <span>01</span>
            <h3>Detect hesitation</h3>
            <p>
              Track exit intent, product comparison, scroll depth, time on page,
              and visitor inactivity.
            </p>
          </article>

          <article className={styles.stepCard}>
            <span>02</span>
            <h3>Trigger the offer</h3>
            <p>
              Show a clean discount banner only when the shopper is most likely
              to need a final push.
            </p>
          </article>

          <article className={styles.stepCard}>
            <span>03</span>
            <h3>Recover the sale</h3>
            <p>
              Use unique, time-limited coupon codes that create urgency without
              training every visitor to wait for discounts.
            </p>
          </article>
        </div>
      </section>

      <section id="features" className={styles.darkSection}>
        {/* Floating particles */}
        <div className={styles.particles}>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
        </div>

        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>Features</p>
          <h2>Built for Shopify stores that want smarter discounts.</h2>
        </div>

        <div className={styles.featuresGrid}>
          <div><span className={styles.iconBox}>01</span>Behavior-based triggers</div>
          <div><span className={styles.iconBox}>02</span>Exit-intent detection</div>
          <div><span className={styles.iconBox}>03</span>Auto-expiring coupons</div>
          <div><span className={styles.iconBox}>04</span>Per-product overrides</div>
          <div><span className={styles.iconBox}>05</span>Analytics dashboard</div>
          <div><span className={styles.iconBox}>06</span>No-code installation</div>
          <div><span className={styles.iconBox}>07</span>Works with Shopify themes</div>
          <div><span className={styles.iconBox}>08</span>Better conversion</div>
        </div>
      </section>

      <section id="install" className={styles.installSection}>
        <div className={styles.installIntro}>
          <p className={styles.sectionKicker}>Pricing</p>
          <h2>Start converting hesitant shoppers today.</h2>
          <p>
            Choose a plan and create your account. Connect your Shopify
            store after checkout.
          </p>
        </div>

        <div className={styles.installCard}>
          <div className={styles.planGrid}>
            <div className={styles.planOption}>
              <span>
                <strong>Starter</strong>
                <b>$4.99/mo</b>
                <small>1 Store</small>
              </span>
            </div>

            <div className={styles.planOption}>
              <span>
                <em>Popular</em>
                <strong>Pro</strong>
                <b>$39.99/mo</b>
                <small>Up to 5 stores</small>
              </span>
            </div>

            <div className={styles.planOption}>
              <span>
                <strong>Enterprise</strong>
                <b>$49.99/mo</b>
                <small>Up to 10 stores</small>
              </span>
            </div>
          </div>

          <a
            href="https://apps.shopify.com/coupon-pulse"
            className={styles.primaryButton}
            style={{ display: 'block', textAlign: 'center', marginTop: '24px' }}
          >
            Install from Shopify App Store
          </a>

          <p className={styles.formHint}>
            Subscribe inside the app after installation. Cancel anytime.
          </p>
        </div>
      </section>


      <section className={styles.reviewsSection}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>Merchant feedback</p>
          <h2>Store owners like the timing, control, and simplicity.</h2>
        </div>

        <div className={styles.reviewsGrid}>
          <article className={styles.reviewCard}>
            <div className={styles.stars}>★★★★★</div>
            <p>
              “We stopped showing discounts to everyone and started showing them only when shoppers were hesitating. It feels much smarter.”
            </p>
            <div className={styles.reviewAuthor}>
	<img
    	className={styles.reviewLogo}
    	src="/shopify-logo.png"
    	alt="Shopify"
 	 />
  	<div>
   	 <strong>Sarah M.</strong>
    	<span>Shopify fashion store owner</span>
  	</div>
	</div>
          </article>

          <article className={styles.reviewCard}>
            <div className={styles.stars}>★★★★★</div>
            <p>
              “The best part is that it does not feel like a spammy popup. It waits for the right moment and keeps the store experience clean.”
            </p>
            <div className={styles.reviewAuthor}>
  <img
    className={styles.reviewLogo}
    src="/shopify-logo.png"
    alt="Shopify"
  />
  <div>
    <strong>Daniel R.</strong>
    <span>Home goods merchant</span>
  </div>
</div>
          </article>

          <article className={styles.reviewCard}>
            <div className={styles.stars}>★★★★★</div>
            <p>
              “Setup was simple, and the product-level control helped us protect margins while still recovering visitors before they left.”
            </p>
            <div className={styles.reviewAuthor}>
  <img
    className={styles.reviewLogo}
    src="/shopify-logo.png"
    alt="Shopify"
  />
  <div>
    <strong>Maya L.</strong>
    <span>Beauty brand operator</span>
  </div>
</div>
          </article>
        </div>
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

      <ChatWidget />
    </main>
  );
}
