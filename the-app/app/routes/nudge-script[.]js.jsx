// Public endpoint: serves the nudge script
// URL: /nudge-script.js (no auth required)

const NUDGE_SCRIPT = `(function () {
  'use strict';

  // ===== SHOP DETECTION =====
  // window.Shopify.shop is not always present - use hostname fallback
  const getShop = () => {
    if (window.Shopify?.shop) return window.Shopify.shop;
    // Fallback: extract from hostname (works for myshopify.com domains)
    const host = window.location.hostname;
    if (host.endsWith('.myshopify.com')) return host;
    // For custom domains, try meta tag or default
    const shopMeta = document.querySelector('meta[name="shopify-shop"]');
    if (shopMeta) return shopMeta.content;
    return host; // Last resort - use hostname
  };
  const SHOP = getShop();

  // ===== SESSION ID =====
  const sessionId = sessionStorage.getItem("nudge_session") || Date.now().toString();
  sessionStorage.setItem("nudge_session", sessionId);

  // ===== TRACKING =====
  const track = (event, data = {}) => {
    if (!SHOP) {
      console.warn("[Nudge] No shop detected - tracking disabled");
      return;
    }
    fetch("/apps/nudge/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        shop: SHOP,
        sessionId,
        event,
        ts: Date.now(),
        ...data
      })
    }).catch(() => {});
  };

  // ===== UTILITIES =====
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  // ===== CONFIG (will be fetched from server) =====
  let CONFIG = {
    enabled: true,
    discount: 10,
    delay: 4000
  };

  const style = document.createElement('style');
  style.innerHTML = \`
    @keyframes nudgeImageFloat {
      0% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-6px) rotate(2deg); }
      100% { transform: translateY(0px) rotate(0deg); }
    }
  \`;
  document.head.appendChild(style);

  // ===== STATE FLAGS =====
  let addedToCart = false;
  let bannerShown = false;
  let triggerQueued = false;  // A trigger has been queued (session reserved)
  let sessionExposed = false; // Banner was actually shown (true exposure)

  // ===== SUPPRESSION FLAGS =====
  // Separate suppression types - engagement should NOT suppress engagement triggers
  let exitIntent = false;     // User shows signs of leaving (suppresses all)
  let purchaseIntent = false; // User clicked buy/checkout (suppresses all - they're converting)

  // ===== CONTROL GROUP =====
  // 15% of sessions get no discount (to measure causation vs correlation)
  const isControlGroup = () => {
    let control = sessionStorage.getItem("nudge_control");
    if (control === null) {
      // Deterministic based on session ID to be consistent
      const hash = sessionId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      control = (hash % 100) < 15 ? "1" : "0";
      sessionStorage.setItem("nudge_control", control);
    }
    return control === "1";
  };

  // ===== BEHAVIORAL CONTEXT =====
  let idleStart = Date.now();
  let variantChanges = 0;
  let maxScrollDepth = 0;
  let lastScrollY = window.scrollY;

  // Track scroll depth (update lastScrollY to fix the bug)
  window.addEventListener('scroll', () => {
    const depth = window.scrollY / (document.body.scrollHeight - window.innerHeight);
    if (depth > maxScrollDepth) maxScrollDepth = depth;
    lastScrollY = window.scrollY; // FIX: update reference point
  });

  // Track variant changes
  document.addEventListener('change', (e) => {
    if (e.target.name === 'id' || e.target.closest('[data-variant]')) {
      variantChanges++;
    }
  });

  // ===== SUPPRESSION DETECTION =====
  // Only suppress on clear exit/purchase intent, NOT on engagement

  // Detect checkout/purchase intent - user is converting, don't interrupt
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('a, button');
    if (!btn) return;
    const text = (btn.innerText || '').toLowerCase();
    const href = btn.href || '';
    if (text.includes('checkout') || text.includes('buy now') || href.includes('/checkout')) {
      purchaseIntent = true;
      console.log("[Nudge] Purchase intent detected → suppress");
    }
  });

  // ===== ADD TO CART DETECTION =====
  let cartAddTime = null;

  const onAddToCart = () => {
    addedToCart = true;
    cartAddTime = Date.now();
    console.log("[Nudge] Add to cart detected");

    // TRIGGER: post_cart_idle - HIGHEST INTENT moment (priority 1)
    // If user added to cart but doesn't checkout within 12 seconds, show nudge
    setTimeout(() => {
      if (triggerQueued || bannerShown || purchaseIntent) return;
      // Check if still on same page (didn't navigate to checkout)
      if (Date.now() - cartAddTime >= 11000) {
        console.log("[Nudge] Post-cart idle detected - user added but didn't checkout");
        queueTrigger("post_cart_idle", true); // immediate = true (highest priority)
      }
    }, 12000);
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, input[type="submit"]');
    if (!btn) return;

    const text = btn.innerText?.toLowerCase() || "";

    // Detect add to cart (but not checkout - that's handled separately)
    if (text.includes('add to cart')) {
      onAddToCart();
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.action?.includes('/cart/add')) {
      onAddToCart();
    }
  });

  // ===== PRODUCT DATA =====
  const getProductData = () => {
    const title =
      document.querySelector('h1')?.innerText ||
      document.title ||
      "Product";

    const image =
      document.querySelector('img.product-media__image')?.currentSrc ||
      document.querySelector('img.product-media__image')?.src ||
      "";

    const variantInput = document.querySelector('form[action*="/cart/add"] [name="id"]');
    const variantId = variantInput?.value;

    return { title, image, variantId };
  };

  // ===== TRIGGER TYPE (the key signal) =====
  let activeTrigger = null;

  // ===== TRIGGER PRIORITY =====
  // Priority: post_cart_idle (1) > hesitation (2) > deep_scroll (3) > idle (4)
  const TRIGGER_PRIORITY = {
    post_cart_idle: 1,
    hesitation: 2,
    deep_scroll: 3,
    idle: 4,
    force: 0
  };

  let pendingTrigger = null;
  let pendingTriggerTimeout = null;

  // Track when a trigger condition is met (BEFORE filtering/showing)
  // This measures: eligible → shown → clicked → converted
  const trackEligible = (triggerType) => {
    const { variantId } = getProductData();
    track("trigger_eligible", {
      triggerType,
      productId: variantId,
      scrollDepth: maxScrollDepth,
      variantChanges,
      idleTime: (Date.now() - idleStart) / 1000
    });
  };

  // Queue trigger and wait for higher priority ones
  const queueTrigger = (triggerType, immediate = false) => {
    // ALWAYS track eligibility first (even if suppressed)
    trackEligible(triggerType);

    // Check suppression conditions
    if (triggerQueued || bannerShown || purchaseIntent) {
      console.log("[Nudge] Trigger eligible but suppressed:", triggerType, { triggerQueued, bannerShown, purchaseIntent });
      return;
    }

    const priority = TRIGGER_PRIORITY[triggerType] || 99;
    const currentPriority = pendingTrigger ? (TRIGGER_PRIORITY[pendingTrigger] || 99) : 99;

    // Only replace if higher priority (lower number)
    if (priority < currentPriority) {
      pendingTrigger = triggerType;
      // Reserve session for this trigger (but not exposed yet)
      triggerQueued = true;
      console.log("[Nudge] Queued trigger:", triggerType, "priority:", priority, "- SESSION RESERVED");

      // For highest priority triggers, fire immediately
      if (immediate || priority <= 1) {
        clearTimeout(pendingTriggerTimeout);
        fireTrigger();
      }
    }
  };

  const fireTrigger = () => {
    if (!pendingTrigger || bannerShown || purchaseIntent) return;
    showBanner(pendingTrigger);
  };

  // ===== BANNER UI =====
  const showBanner = (triggerType) => {
    if (bannerShown) return;
    if (sessionStorage.getItem("nudge_closed")) return;

    const { title, image, variantId } = getProductData();

    if (!variantId) {
      console.log("[Nudge] No variant ID found → abort (session NOT locked)");
      // IMPORTANT: Don't lock session if banner couldn't show
      triggerQueued = false;
      return;
    }

    // NOW we have true exposure
    bannerShown = true;
    sessionExposed = true;
    activeTrigger = triggerType;

    // Check if control group (no discount)
    const inControlGroup = isControlGroup();
    const effectiveDiscount = inControlGroup ? 0 : CONFIG.discount;

    // Track banner shown with behavioral context and trigger type
    const idleTime = (Date.now() - idleStart) / 1000;
    // decisionSource is for A/B test: "control" (no discount) vs "treatment" (with discount)
    const decisionSource = inControlGroup ? "control" : "treatment";
    track("banner_shown", {
      triggerType: triggerType,
      delay: CONFIG.delay,
      discount: CONFIG.discount,         // System's decision (what optimizer chose)
      appliedDiscount: effectiveDiscount, // What was actually shown (0 for control)
      decisionSource,
      controlGroup: inControlGroup,
      idleTime,
      scrollDepth: maxScrollDepth,
      variantChanges,
      productId: variantId
    });

    console.log("[Nudge] TRIGGER:", triggerType, "| idleTime:", idleTime.toFixed(1), "s | scroll:", (maxScrollDepth * 100).toFixed(0), "% | variants:", variantChanges, "| control:", inControlGroup);

    const container = document.createElement('div');

    container.style.position = 'fixed';
    container.style.bottom = '20%';
    container.style.right = '20px';
    container.style.zIndex = '999999';
    container.style.background = '#fff';
    container.style.border = '1px solid #ddd';
    container.style.borderRadius = '10px';
    container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
    container.style.padding = '12px';
    container.style.width = '280px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.animation = 'fadeIn 0.3s ease';

    container.innerHTML = \`
      <div style="display:flex; gap:10px;">
        <img src="\${image}"
          style="width:60px;height:60px;object-fit:cover;border-radius:6px;
                 animation: nudgeImageFloat 4s ease-in-out infinite;
                 will-change: transform;" />

        <div style="flex:1;">
          <div style="font-size:14px;font-weight:bold;margin-bottom:4px;">
            Still thinking?
          </div>

          <div style="font-size:11px;color:#888;margin-bottom:6px;">
            🔥 \${Math.floor(Math.random() * 18) + 5} people viewed this recently
          </div>

          <div style="font-size:12px;color:#555;margin-bottom:8px;">
            \${inControlGroup ? "Complete your purchase of " + title + " now" : "Get " + CONFIG.discount + "% off " + title}
          </div>

          <a href="#" id="nudge-btn"
             style="display:block;background:#000;color:#fff;text-align:center;padding:8px;border-radius:6px;font-size:13px;text-decoration:none;">
             \${inControlGroup ? "Buy Now" : "Get Discount"}
          </a>
        </div>

        <div style="cursor:pointer;font-size:14px;" id="nudge-close">✕</div>
      </div>
    \`;

    container.querySelector('#nudge-btn').onclick = (e) => {
      e.preventDefault();

      track("banner_clicked", {
        productId: variantId,
        delay: CONFIG.delay,
        discount: CONFIG.discount,         // System's decision (what optimizer chose)
        appliedDiscount: effectiveDiscount, // What was actually shown (0 for control)
        decisionSource,
        triggerType: activeTrigger,
        controlGroup: inControlGroup
      });

      // Control group: add to cart WITH session tracking (for attribution)
      // We add a cart attribute so we can track conversions even without discount code
      if (inControlGroup) {
        // Add to cart with nudge session attribute for attribution
        fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: variantId,
            quantity: 1,
            properties: {
              _nudge_session: sessionId,
              _nudge_trigger: activeTrigger || "unknown",
              _nudge_control: "true",
              _nudge_delay: String(CONFIG.delay),    // System's delay decision
              _nudge_discount: String(CONFIG.discount) // System's discount decision (for learning)
            }
          })
        }).then(() => {
          window.location.href = "/cart";
        }).catch(() => {
          // Fallback to simple redirect
          window.location.href = "/cart/" + variantId + ":1";
        });
        return;
      }

      // Treatment group: create discount and redirect
      const discountUrl = "/apps/nudge/create-discount?shop=" + SHOP +
        "&sessionId=" + sessionId +
        "&triggerType=" + (activeTrigger || "unknown") +
        "&productId=" + variantId +
        "&delay=" + CONFIG.delay;

      fetch(discountUrl)
        .then(r => r.json())
        .then(data => {
          if (data.code) {
            window.location.href = "/discount/" + data.code + "?redirect=/cart/" + variantId + ":1";
          } else {
            // Discount creation failed - still add to cart without discount
            console.warn("[Nudge] Discount creation failed:", data.error);
            window.location.href = "/cart/" + variantId + ":1";
          }
        })
        .catch(err => {
          console.error("[Nudge] Discount fetch error:", err);
          // Fallback - add to cart without discount
          window.location.href = "/cart/" + variantId + ":1";
        });
    };

    document.body.appendChild(container);

    // Close button
    container.querySelector('#nudge-close').onclick = () => {
      track("banner_closed", { productId: variantId, delay: CONFIG.delay, discount: CONFIG.discount, appliedDiscount: effectiveDiscount, decisionSource });
      sessionStorage.setItem("nudge_closed", "1");
      container.remove();
    };

    console.log("[Nudge] Banner shown with config:", CONFIG);
  };

  // ===== FETCH CONFIG AND START =====
  const init = async () => {
    // Get product ID from page
    const { variantId } = getProductData();
    const productParam = variantId ? "&productId=" + variantId : "";

    // 1. Fetch merchant config (with product override if available)
    try {
      const res = await fetch("/apps/nudge/get-config?shop=" + SHOP + productParam);
      const data = await res.json();
      CONFIG = { ...CONFIG, ...data };
      console.log("[Nudge] Config loaded:", CONFIG);
    } catch (err) {
      console.log("[Nudge] Using default config");
    }

    // Check if nudge is enabled
    if (!CONFIG.enabled) {
      console.log("[Nudge] Disabled by config");
      return;
    }

    // 2. Use config values (override or global defaults)
    // SIMPLIFIED: No combo optimization yet - focus on trigger type validation first
    const min = CONFIG.minDelay || 2000;
    const max = CONFIG.maxDelay || 20000;
    const minDiscount = CONFIG.minDiscount || 5;
    const maxDiscount = CONFIG.maxDiscount || 30;

    CONFIG.delay = clamp(CONFIG.delay, min, max);
    CONFIG.discount = clamp(CONFIG.discount, minDiscount, maxDiscount);
    const configSource = CONFIG.disableOptimize ? "override" : "global"; // For logging only

    console.log("[Nudge] Using - Delay:", CONFIG.delay, "ms, Discount:", CONFIG.discount, "%, Config source:", configSource);

    // 3. Force show check (skip trigger conditions)
    if (CONFIG.forceShow) {
      console.log("[Nudge] Force show enabled");
      sessionTriggered = true; // Lock session
      setTimeout(() => showBanner("force"), CONFIG.delay);
      return;
    }

    // ===== BEHAVIORAL TRIGGER DETECTION =====
    // This is what we need to validate: which triggers correlate with conversion?

    // TRIGGER 1: Hesitation (user changed variants multiple times) - priority 2
    // NOTE: Variant changes ARE the trigger, so don't suppress on engagement
    let hesitationChecked = false;
    const checkHesitation = () => {
      if (hesitationChecked || triggerQueued || bannerShown || purchaseIntent) return;
      if (variantChanges >= 2) {
        hesitationChecked = true;
        console.log("[Nudge] Hesitation detected: variant changes =", variantChanges);
        queueTrigger("hesitation");
        // Give 2s for higher priority triggers before firing
        clearTimeout(pendingTriggerTimeout);
        pendingTriggerTimeout = setTimeout(fireTrigger, 2000);
      }
    };

    // Check hesitation on variant change
    document.addEventListener('change', (e) => {
      if (e.target.name === 'id' || e.target.closest('[data-variant]')) {
        setTimeout(checkHesitation, 500);
      }
    });

    // TRIGGER 2: Deep scroll (user scrolled past 70% of page) - priority 3
    // NOTE: Scrolling IS the trigger, so don't suppress on scroll engagement
    let scrollTriggered = false;
    window.addEventListener('scroll', () => {
      if (scrollTriggered || triggerQueued || bannerShown || purchaseIntent) return;
      if (maxScrollDepth > 0.7) {
        scrollTriggered = true;
        console.log("[Nudge] Deep scroll detected:", (maxScrollDepth * 100).toFixed(0), "%");
        queueTrigger("deep_scroll");
        // Give 3s for higher priority triggers before firing
        clearTimeout(pendingTriggerTimeout);
        pendingTriggerTimeout = setTimeout(fireTrigger, 3000);
      }
    });

    // TRIGGER 3: Idle timeout (user stayed but didn't act) - priority 4 (lowest)
    // This one DOES get suppressed by other triggers
    setTimeout(() => {
      if (triggerQueued || bannerShown || purchaseIntent) {
        console.log("[Nudge] Idle trigger suppressed - already triggered or purchasing");
        return;
      }
      console.log("[Nudge] Idle timeout reached");
      queueTrigger("idle");
      // Give 1s for any pending higher priority triggers
      clearTimeout(pendingTriggerTimeout);
      pendingTriggerTimeout = setTimeout(fireTrigger, 1000);
    }, CONFIG.delay);
  };

  // Start the script
  init();

})();`;

export const loader = async () => {
  return new Response(NUDGE_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
