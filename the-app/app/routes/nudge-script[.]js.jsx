// Public endpoint: serves the nudge script
// URL: /nudge-script.js (no auth required)

const NUDGE_SCRIPT = `(function () {
  'use strict';

  // ===== DUPLICATE SCRIPT GUARD =====
  // Prevent multiple listeners if script is injected twice
  if (window.__NUDGE_LOADED__) return;
  window.__NUDGE_LOADED__ = true;

  // ===== SHOP DETECTION =====
  // window.Shopify.shop is not always present - use hostname fallback
  const getShop = () => {
    if (window.Shopify?.shop) return window.Shopify.shop;
    // Fallback: extract from hostname (works for myshopify.com domains)
    const host = window.location.hostname;
    if (host.endsWith('.myshopify.com')) return host;
    // For custom domains, try meta tag
    const shopMeta = document.querySelector('meta[name="shopify-shop"]');
    if (shopMeta?.content?.endsWith('.myshopify.com')) return shopMeta.content;
    // No valid shop found - return null (tracking will be disabled)
    return null;
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
    delay: 4000,
    bannerPosition: "bottom-right",
    bannerSize: "medium"
  };

  // Inject style only once (guard against duplicates)
  if (!document.getElementById('nudge-style')) {
    const style = document.createElement('style');
    style.id = 'nudge-style';
    style.innerHTML = \`
      @keyframes nudgeImageFloat {
        0% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-6px) rotate(2deg); }
        100% { transform: translateY(0px) rotate(0deg); }
      }
    \`;
    document.head.appendChild(style);
  }

  // ===== STATE FLAGS =====
  let addedToCart = false;
  let bannerShown = false;
  let triggerQueued = false;  // A trigger has been queued (session reserved)
  let sessionExposed = false; // Banner was actually shown (true exposure)

  // ===== SUPPRESSION FLAGS =====
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

  // ===== TAB ATTENTION (when user switches away) =====
  let originalTitle = document.title;
  let tabAttentionInterval = null;
  let tabAttentionTimeout = null;  // Track the timeout so we can cancel it
  let tabAttentionActive = false;
  let tabAttentionDiscount = null; // Will be set to final discount when banner shown
  let tabLeftAt = null;
  let discountPreloaded = null;    // Preloaded discount code for instant use on return
  let preloadedDiscount = null;    // The discount % that was preloaded
  let preloadInProgress = false;   // Prevent race condition on rapid tab switches
  let soundPlayed = false;

  // Preload discount while user is away (so it's ready when they return)
  const preloadDiscount = async () => {
    if (discountPreloaded || preloadInProgress || isControlGroup()) return; // Already preloaded, in progress, or control group
    preloadInProgress = true;

    // Get both productId and variantId
    const { productId, variantId } = getProductData();
    if (!variantId) {
      preloadInProgress = false;
      return;
    }

    // Calculate intent-adjusted discount for tab_return trigger
    const triggerCfg = TRIGGER_CONFIG.tab_return || TRIGGER_CONFIG.exit_intent;
    const baseDiscount = CONFIG.discount;
    const minDiscount = CONFIG.minDiscount || 5;
    const maxDiscount = CONFIG.maxDiscount || 30;
    const adjustedDiscount = Math.round(baseDiscount * triggerCfg.discountMult);
    preloadedDiscount = clamp(adjustedDiscount, minDiscount, maxDiscount);

    try {
      const res = await fetch(
        "/apps/nudge/create-discount?shop=" + SHOP +
        "&sessionId=" + sessionId +
        "&triggerType=tab_return" +
        "&productId=" + (productId || variantId) +
        "&delay=" + CONFIG.delay +
        "&discount=" + preloadedDiscount
      );
      const data = await res.json();
      if (data.code) {
        discountPreloaded = data.code;
        tabAttentionDiscount = preloadedDiscount; // Update tab title discount
        preloadInProgress = false; // Reset on success (preload complete)
        console.log("[Nudge] Discount preloaded:", data.code, "(" + preloadedDiscount + "%)");
      } else {
        preloadInProgress = false; // Reset on failure to allow retry
      }
    } catch (e) {
      console.warn("[Nudge] Failed to preload discount:", e);
      preloadInProgress = false; // Reset on error to allow retry
    }
  };

  // Play subtle attention sound (once only)
  const playAttentionSound = () => {
    if (soundPlayed) return;
    soundPlayed = true;
    try {
      // Use a subtle, short beep - won't play if user hasn't interacted yet (browser policy)
      const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Silently fail if blocked
    } catch (e) {}
  };

  const startTabAttention = () => {
    if (tabAttentionActive || !CONFIG.enabled) return;
    // Don't spam - only once per session
    if (sessionStorage.getItem("nudge_tab_attention")) return;
    sessionStorage.setItem("nudge_tab_attention", "1");

    tabAttentionActive = true;

    // Use the preloaded discount if available, otherwise base discount
    const displayDiscount = tabAttentionDiscount || CONFIG.discount;

    let showDiscount = true;
    let cycleCount = 0;
    const maxCycles = 10; // Limit to 15 seconds (10 cycles x 1.5s)

    tabAttentionInterval = setInterval(() => {
      cycleCount++;
      if (cycleCount >= maxCycles) {
        stopTabAttention();
        return;
      }
      if (showDiscount) {
        document.title = "🔥 " + displayDiscount + "% OFF - Don't miss out!";
      } else {
        document.title = "👋 Come back! " + originalTitle;
      }
      showDiscount = !showDiscount;
    }, 1500);
  };

  const stopTabAttention = () => {
    // Cancel pending timeout if user comes back quickly
    if (tabAttentionTimeout) {
      clearTimeout(tabAttentionTimeout);
      tabAttentionTimeout = null;
    }
    if (!tabAttentionActive) return;
    tabAttentionActive = false;
    if (tabAttentionInterval) {
      clearInterval(tabAttentionInterval);
      tabAttentionInterval = null;
    }
    document.title = originalTitle;
  };

  // Listen for tab visibility changes - IMPROVED with preloading
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      tabLeftAt = Date.now();

      // Preload discount if banner not shown yet
      if (!bannerShown && !purchaseIntent) {
        preloadDiscount();
      }

      // Simple: start tab attention 1.5s after leaving (if not purchased)
      if (!purchaseIntent) {
        tabAttentionTimeout = setTimeout(() => {
          if (document.hidden && !purchaseIntent) {
            startTabAttention();
            playAttentionSound();
          }
        }, 1500);
      }

    } else {
      // User came back
      stopTabAttention();

      // If we preloaded a discount and haven't shown banner yet → instant conversion push
      if (discountPreloaded && !bannerShown && !purchaseIntent && !triggerQueued) {
        const timeAway = tabLeftAt ? (Date.now() - tabLeftAt) / 1000 : 0;
        console.log("[Nudge] User returned after", timeAway.toFixed(0), "s → showing preloaded discount");

        // Track the return
        track("tab_return", {
          timeAway,
          discountPreloaded: preloadedDiscount
        });

        // Show banner immediately with preloaded discount
        queueTrigger("tab_return", true);
      }
    }
  });

  // ===== BEHAVIORAL CONTEXT =====
  let idleStart = Date.now();
  let pageLoadTime = Date.now();
  let variantChanges = 0;
  let maxScrollDepth = 0;
  let lastScrollY = window.scrollY;
  let scrollDirection = 'down'; // 'up' or 'down'
  let scrollReversals = 0;
  let lastScrollDirection = 'down';

  // ===== RETURNING VISITOR DETECTION =====
  const isReturningVisitor = () => {
    const visitCount = parseInt(localStorage.getItem('nudge_visits') || '0');
    localStorage.setItem('nudge_visits', String(visitCount + 1));
    return visitCount > 0;
  };
  const returningVisitor = isReturningVisitor();

  // Track scroll depth AND scroll reversal
  window.addEventListener('scroll', () => {
    // Use Math.max(1, ...) to prevent division by zero or negative values
    const denom = Math.max(1, document.body.scrollHeight - window.innerHeight);
    const depth = window.scrollY / denom;
    if (depth > maxScrollDepth) maxScrollDepth = depth;

    // Detect scroll direction change (reversal signal)
    const currentDirection = window.scrollY > lastScrollY ? 'down' : 'up';
    if (currentDirection !== lastScrollDirection && Math.abs(window.scrollY - lastScrollY) > 50) {
      scrollReversals++;
      lastScrollDirection = currentDirection;
    }
    scrollDirection = currentDirection;
    lastScrollY = window.scrollY;
  }, { passive: true });

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

    // Get variant ID from form (for cart operations)
    const variantInput = document.querySelector('form[action*="/cart/add"] [name="id"]');
    const variantId = variantInput?.value;

    // Get PRODUCT ID (not variant) for config lookups
    // Try multiple sources - Shopify exposes this in different ways
    let productId = null;

    // Method 1: ShopifyAnalytics (most reliable)
    if (window.ShopifyAnalytics?.meta?.product?.id) {
      productId = String(window.ShopifyAnalytics.meta.product.id);
    }
    // Method 2: Product JSON in page
    else if (window.meta?.product?.id) {
      productId = String(window.meta.product.id);
    }
    // Method 3: Look for product JSON script tag
    else {
      const jsonScript = document.querySelector('script[type="application/json"][data-product-json]');
      if (jsonScript) {
        try {
          const data = JSON.parse(jsonScript.textContent);
          productId = String(data.id);
        } catch (e) {}
      }
    }
    // Method 4: Extract from URL if format is /products/handle
    if (!productId) {
      const match = window.location.pathname.match(/\\/products\\/([^\\/\\?]+)/);
      if (match) {
        // This gives us the handle, not the ID - but we can use it as fallback
        productId = match[1]; // handle as fallback
      }
    }

    return { title, image, variantId, productId };
  };

  // ===== TRIGGER TYPE (the key signal) =====
  let activeTrigger = null;

  // ===== TRIGGER PRIORITY & SCORING =====
  // Lower number = higher priority = fires first
  // Also includes discount multiplier (intent-based discount adjustment)
  const TRIGGER_CONFIG = {
    exit_intent:     { priority: 1, discountMult: 1.2, delayMs: 0 },      // Leaving = last chance, +20% discount
    tab_return:      { priority: 1, discountMult: 1.2, delayMs: 0 },      // Came back after leaving = high intent
    post_cart_idle:  { priority: 2, discountMult: 1.15, delayMs: 0 },     // Added but didn't buy = high intent, +15%
    scroll_reversal: { priority: 3, discountMult: 1.1, delayMs: 1000 },   // Re-evaluating = uncertainty, +10%
    hesitation:      { priority: 4, discountMult: 1.05, delayMs: 2000 },  // Variant comparison = considering, +5%
    consideration:   { priority: 5, discountMult: 1.0, delayMs: 3000 },   // Long time on page = real hesitation
    deep_scroll:     { priority: 6, discountMult: 0.95, delayMs: 3000 },  // Exploring = interest, -5%
    idle:            { priority: 7, discountMult: 0.9, delayMs: 1000 },   // Just waiting = low signal, -10%
    force:           { priority: 0, discountMult: 1.0, delayMs: 0 }       // Manual trigger
  };

  // Legacy compat
  const TRIGGER_PRIORITY = Object.fromEntries(
    Object.entries(TRIGGER_CONFIG).map(([k, v]) => [k, v.priority])
  );

  let pendingTrigger = null;
  let pendingTriggerTimeout = null;

  // Track when a trigger condition is met (BEFORE filtering/showing)
  // This measures: eligible → shown → clicked → converted
  const trackEligible = (triggerType) => {
    const { productId, variantId } = getProductData();
    track("trigger_eligible", {
      triggerType,
      productId: productId || variantId, // Prefer real productId, fallback to variantId
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
      console.log("[Nudge] Queued trigger:", triggerType, "priority:", priority);

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

    const { title, image, variantId, productId } = getProductData();

    if (!variantId) {
      console.log("[Nudge] No variant ID found → abort (session NOT locked)");
      return;
    }

    // NOW we have true exposure - lock session here (not earlier)
    triggerQueued = true;
    bannerShown = true;
    sessionExposed = true;
    activeTrigger = triggerType;

    // ===== INTENT-BASED DISCOUNT ADJUSTMENT =====
    // Higher intent signals = higher discount multiplier
    const triggerConfig = TRIGGER_CONFIG[triggerType] || TRIGGER_CONFIG.idle;
    const baseDiscount = CONFIG.discount;
    const minDiscount = CONFIG.minDiscount || 5;
    const maxDiscount = CONFIG.maxDiscount || 30;

    // Apply multiplier: exit_intent gets +20%, post_cart +15%, scroll_reversal +10%, etc.
    const adjustedDiscount = Math.round(baseDiscount * triggerConfig.discountMult);
    // Clamp to store limits
    const finalDiscount = clamp(adjustedDiscount, minDiscount, maxDiscount);

    // Check if control group (no discount)
    const inControlGroup = isControlGroup();
    const effectiveDiscount = inControlGroup ? 0 : finalDiscount;

    // Log the adjustment for debugging
    if (finalDiscount !== baseDiscount) {
      console.log("[Nudge] Discount adjusted:", baseDiscount, "% →", finalDiscount, "% (", triggerType, "mult:", triggerConfig.discountMult, ")");
    }

    // Update tab attention discount so it shows the correct value
    tabAttentionDiscount = finalDiscount;

    // Track banner shown with behavioral context and trigger type
    const idleTime = (Date.now() - idleStart) / 1000;
    // decisionSource is for A/B test: "control" (no discount) vs "treatment" (with discount)
    const decisionSource = inControlGroup ? "control" : "treatment";
    track("banner_shown", {
      triggerType: triggerType,
      delay: CONFIG.delay,
      discount: finalDiscount,           // Final discount after intent adjustment
      baseDiscount: baseDiscount,        // Original optimizer decision (for learning)
      discountMult: triggerConfig.discountMult, // Multiplier applied
      appliedDiscount: effectiveDiscount, // What was actually shown (0 for control)
      decisionSource,
      controlGroup: inControlGroup,
      idleTime,
      scrollDepth: maxScrollDepth,
      variantChanges,
      productId: productId || variantId  // Prefer real productId
    });

    console.log("[Nudge] TRIGGER:", triggerType, "| discount:", finalDiscount, "% (base:", baseDiscount, "%, mult:", triggerConfig.discountMult, ") | idleTime:", idleTime.toFixed(1), "s | scroll:", (maxScrollDepth * 100).toFixed(0), "% | control:", inControlGroup);

    const container = document.createElement('div');

    // ===== POSITION CALCULATION =====
    const position = CONFIG.bannerPosition || 'bottom-right';
    const positionStyles = {
      'bottom-right': { bottom: '20px', right: '20px', top: 'auto', left: 'auto' },
      'bottom-left': { bottom: '20px', left: '20px', top: 'auto', right: 'auto' },
      'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)', top: 'auto', right: 'auto' },
      'top-right': { top: '20px', right: '20px', bottom: 'auto', left: 'auto' },
      'top-left': { top: '20px', left: '20px', bottom: 'auto', right: 'auto' },
      'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)', bottom: 'auto', right: 'auto' }
    };
    const posStyle = positionStyles[position] || positionStyles['bottom-right'];

    // ===== SIZE CALCULATION =====
    const size = CONFIG.bannerSize || 'medium';
    const sizeStyles = {
      'small': { width: '240px', padding: '10px', fontSize: '12px', imgSize: '50px' },
      'medium': { width: '280px', padding: '12px', fontSize: '14px', imgSize: '60px' },
      'large': { width: '340px', padding: '16px', fontSize: '16px', imgSize: '80px' }
    };
    const sizeStyle = sizeStyles[size] || sizeStyles['medium'];

    container.style.position = 'fixed';
    container.style.zIndex = '999999';
    container.style.background = '#fff';
    container.style.border = '1px solid #ddd';
    container.style.borderRadius = '10px';
    container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.animation = 'fadeIn 0.3s ease';

    // Apply position
    if (posStyle.top) container.style.top = posStyle.top;
    if (posStyle.bottom) container.style.bottom = posStyle.bottom;
    if (posStyle.left) container.style.left = posStyle.left;
    if (posStyle.right) container.style.right = posStyle.right;
    if (posStyle.transform) container.style.transform = posStyle.transform;

    // Apply size
    container.style.width = sizeStyle.width;
    container.style.padding = sizeStyle.padding;

    // Calculate scaled font sizes based on banner size
    const headingSize = size === 'small' ? '12px' : size === 'large' ? '16px' : '14px';
    const subTextSize = size === 'small' ? '10px' : size === 'large' ? '13px' : '11px';
    const bodySize = size === 'small' ? '11px' : size === 'large' ? '14px' : '12px';
    const btnSize = size === 'small' ? '11px' : size === 'large' ? '15px' : '13px';
    const btnPadding = size === 'small' ? '6px' : size === 'large' ? '10px' : '8px';

    container.innerHTML = \`
      <div style="display:flex; gap:10px;">
        <img src="\${image}"
          style="width:\${sizeStyle.imgSize};height:\${sizeStyle.imgSize};object-fit:cover;border-radius:6px;
                 animation: nudgeImageFloat 4s ease-in-out infinite;
                 will-change: transform;" />

        <div style="flex:1;">
          <div style="font-size:\${headingSize};font-weight:bold;margin-bottom:4px;">
            Still thinking?
          </div>

          <div style="font-size:\${subTextSize};color:#888;margin-bottom:6px;">
            🔥 \${Math.floor(Math.random() * 18) + 5} people viewed this recently
          </div>

          <div style="font-size:\${bodySize};color:#555;margin-bottom:8px;">
            \${inControlGroup ? "Complete your purchase of " + title + " now" : "Get " + finalDiscount + "% off " + title}
          </div>

          <a href="#" id="nudge-btn"
             style="display:block;background:#000;color:#fff;text-align:center;padding:\${btnPadding};border-radius:6px;font-size:\${btnSize};text-decoration:none;">
             \${inControlGroup ? "Buy Now" : "Get Discount"}
          </a>
        </div>

        <div style="cursor:pointer;font-size:\${headingSize};" id="nudge-close">✕</div>
      </div>
    \`;

    container.querySelector('#nudge-btn').onclick = (e) => {
      e.preventDefault();

      track("banner_clicked", {
        productId: productId || variantId, // Prefer real productId
        delay: CONFIG.delay,
        discount: finalDiscount,           // Final discount after intent adjustment
        baseDiscount: baseDiscount,        // Original optimizer decision
        discountMult: triggerConfig.discountMult,
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
      // Use preloaded discount if available (for tab_return), otherwise create new one
      if (discountPreloaded && activeTrigger === "tab_return") {
        console.log("[Nudge] Using preloaded discount:", discountPreloaded);
        window.location.href = "/discount/" + discountPreloaded + "?redirect=/cart/" + variantId + ":1";
        return;
      }

      // Pass finalDiscount (after intent-based adjustment) so create-discount uses the adjusted value
      const discountUrl = "/apps/nudge/create-discount?shop=" + SHOP +
        "&sessionId=" + sessionId +
        "&triggerType=" + (activeTrigger || "unknown") +
        "&productId=" + (productId || variantId) +
        "&delay=" + CONFIG.delay +
        "&discount=" + finalDiscount;

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
      track("banner_closed", { productId: productId || variantId, delay: CONFIG.delay, discount: finalDiscount, baseDiscount, appliedDiscount: effectiveDiscount, decisionSource, triggerType });
      sessionStorage.setItem("nudge_closed", "1");
      container.remove();
    };

    console.log("[Nudge] Banner shown | trigger:", triggerType, "| finalDiscount:", finalDiscount, "%");
  };

  // ===== LOCALSTORAGE CONFIG CACHE =====
  const CONFIG_CACHE_KEY = "nudge_config_" + (window.Shopify?.shop || "");
  const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const getCachedConfig = () => {
    try {
      const cached = localStorage.getItem(CONFIG_CACHE_KEY);
      if (!cached) return null;
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts > CONFIG_CACHE_TTL) {
        localStorage.removeItem(CONFIG_CACHE_KEY);
        return null;
      }
      return data;
    } catch (e) { return null; }
  };

  const setCachedConfig = (data) => {
    try {
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch (e) {}
  };

  // ===== FETCH CONFIG (non-blocking) =====
  const fetchConfigAsync = (productParam) => {
    fetch("/apps/nudge/get-config?shop=" + SHOP + productParam)
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(data => {
        if (data && typeof data === "object") {
          CONFIG = { ...CONFIG, ...data };
          setCachedConfig(data);
          console.log("[Nudge] Config loaded from server:", CONFIG);
        }
      })
      .catch(err => {
        console.warn("[Nudge] Config fetch failed:", err.message, "- using defaults");
      });
  };

  // ===== FETCH CONFIG AND START =====
  const init = () => {
    // CRITICAL: Abort if no valid shop detected (prevents null shop in requests)
    if (!SHOP) {
      console.warn("[Nudge] No valid shop detected → abort script");
      return;
    }

    // NOTE: Product page check is now handled by Liquid in Theme App Extension
    // The script only loads on product pages via: {% if template.name == 'product' %}

    // Get product ID from page (productId for config, variantId for cart)
    const { productId, variantId } = getProductData();
    const productParam = productId ? "&productId=" + productId : "";

    // 1. Load config (non-blocking - use cache if available, fetch in background)
    const cachedConfig = getCachedConfig();
    if (cachedConfig) {
      CONFIG = { ...CONFIG, ...cachedConfig };
      console.log("[Nudge] Config loaded from cache:", CONFIG);
    } else {
      // Start fetch but don't wait - use defaults initially
      fetchConfigAsync(productParam);
    }

    // Check if nudge is enabled (may use default until config loads)
    if (!CONFIG.enabled) {
      console.log("[Nudge] Disabled by config");
      return;
    }

    // 2. Use config values (override or global defaults)
    const min = CONFIG.minDelay || 2000;
    const max = CONFIG.maxDelay || 20000;
    const minDiscount = CONFIG.minDiscount || 5;
    const maxDiscount = CONFIG.maxDiscount || 30;

    CONFIG.delay = clamp(CONFIG.delay, min, max);
    CONFIG.discount = clamp(CONFIG.discount, minDiscount, maxDiscount);

    // OBSERVABILITY: Track what the optimizer decided for this session
    // This creates a permanent record we can analyze later
    track("optimizer_decision", {
      delay: CONFIG.delay,
      discount: CONFIG.discount,
      valueSource: CONFIG.valueSource || "unknown",  // learned | exploration | default | forced
      productId: productId || variantId  // Prefer real productId
    });

    const configSource = CONFIG.disableOptimize ? "override" : "global"; // For logging only

    console.log("[Nudge] Using - Delay:", CONFIG.delay, "ms, Discount:", CONFIG.discount, "%, Config source:", configSource);

    // 3. Force show check (skip trigger conditions)
    if (CONFIG.forceShow) {
      console.log("[Nudge] Force show enabled");
      triggerQueued = true; // Lock session
      setTimeout(() => showBanner("force"), CONFIG.delay);
      return;
    }

    // ===== BEHAVIORAL TRIGGER DETECTION =====
    // Priority-based system: higher intent signals = faster trigger + higher discount

    // Adjust base delay for returning visitors (they need push, not discovery)
    const baseDelay = returningVisitor ? Math.max(2000, CONFIG.delay * 0.6) : CONFIG.delay;
    if (returningVisitor) {
      console.log("[Nudge] Returning visitor detected - faster trigger");
    }

    // Helper to schedule trigger with config-based delay
    const scheduleTrigger = (triggerType) => {
      const cfg = TRIGGER_CONFIG[triggerType] || TRIGGER_CONFIG.idle;
      clearTimeout(pendingTriggerTimeout);
      pendingTriggerTimeout = setTimeout(fireTrigger, cfg.delayMs);
    };

    // ===== TRIGGER 1: EXIT INTENT (highest priority after post_cart) =====
    // Mouse leaves top of viewport = user about to close/navigate away
    let exitIntentTriggered = false;
    const exitIntentHandler = (e) => {
      if (exitIntentTriggered || triggerQueued || bannerShown || purchaseIntent) return;
      // Only trigger if mouse leaves from top (< 10px from top)
      if (e.clientY < 10) {
        exitIntentTriggered = true;
        console.log("[Nudge] EXIT INTENT detected - mouse left top");
        queueTrigger("exit_intent", true); // immediate
      }
    };
    document.addEventListener('mouseleave', exitIntentHandler, { once: true });

    // Also detect tab blur as exit intent signal
    let blurTimeout = null;
    window.addEventListener('blur', () => {
      if (exitIntentTriggered || triggerQueued || bannerShown || purchaseIntent) return;
      // Wait 3s to confirm they're actually leaving
      blurTimeout = setTimeout(() => {
        if (!document.hasFocus() && !exitIntentTriggered) {
          exitIntentTriggered = true;
          console.log("[Nudge] EXIT INTENT detected - tab lost focus");
          queueTrigger("exit_intent", true);
        }
      }, 3000);
    });
    window.addEventListener('focus', () => {
      if (blurTimeout) clearTimeout(blurTimeout);
    });

    // ===== TRIGGER 2: SCROLL REVERSAL (re-evaluating = uncertainty) =====
    let scrollReversalTriggered = false;
    window.addEventListener('scroll', () => {
      if (scrollReversalTriggered || triggerQueued || bannerShown || purchaseIntent) return;
      // User scrolled down deep, then scrolled back up = re-evaluating
      if (maxScrollDepth > 0.5 && scrollReversals >= 2 && scrollDirection === 'up') {
        scrollReversalTriggered = true;
        console.log("[Nudge] SCROLL REVERSAL detected - user re-evaluating");
        queueTrigger("scroll_reversal");
        scheduleTrigger("scroll_reversal");
      }
    }, { passive: true });

    // ===== TRIGGER 3: HESITATION (variant comparison) =====
    let hesitationChecked = false;
    const checkHesitation = () => {
      if (hesitationChecked || triggerQueued || bannerShown || purchaseIntent) return;
      if (variantChanges >= 2) {
        hesitationChecked = true;
        console.log("[Nudge] HESITATION detected: variant changes =", variantChanges);
        queueTrigger("hesitation");
        scheduleTrigger("hesitation");
      }
    };
    document.addEventListener('change', (e) => {
      if (e.target.name === 'id' || e.target.closest('[data-variant]')) {
        setTimeout(checkHesitation, 500);
      }
    });

    // ===== TRIGGER 4: CONSIDERATION (long time on page without action) =====
    // Different from idle: this is 25+ seconds of real consideration
    let considerationTriggered = false;
    setTimeout(() => {
      if (considerationTriggered || triggerQueued || bannerShown || purchaseIntent || addedToCart) return;
      const timeOnPage = (Date.now() - pageLoadTime) / 1000;
      if (timeOnPage >= 25) {
        considerationTriggered = true;
        console.log("[Nudge] CONSIDERATION detected - long time on page:", timeOnPage.toFixed(0), "s");
        queueTrigger("consideration");
        scheduleTrigger("consideration");
      }
    }, 25000);

    // ===== TRIGGER 5: DEEP SCROLL (exploring product) =====
    let deepScrollTriggered = false;
    window.addEventListener('scroll', () => {
      if (deepScrollTriggered || triggerQueued || bannerShown || purchaseIntent) return;
      if (maxScrollDepth > 0.7) {
        deepScrollTriggered = true;
        console.log("[Nudge] DEEP SCROLL detected:", (maxScrollDepth * 100).toFixed(0), "%");
        queueTrigger("deep_scroll");
        scheduleTrigger("deep_scroll");
      }
    }, { passive: true });

    // ===== TRIGGER 6: IDLE (fallback - user just waiting) =====
    // Lowest priority - only fires if nothing else triggered
    setTimeout(() => {
      if (triggerQueued || bannerShown || purchaseIntent) {
        console.log("[Nudge] IDLE trigger suppressed - already triggered or purchasing");
        return;
      }
      console.log("[Nudge] IDLE timeout reached");
      queueTrigger("idle");
      scheduleTrigger("idle");
    }, baseDelay);
  };

  // Start the script - use requestIdleCallback for performance (non-blocking)
  const startNudge = () => init();
  if ('requestIdleCallback' in window) {
    requestIdleCallback(startNudge, { timeout: 2000 });
  } else {
    setTimeout(startNudge, 0);
  }

})();`;

export const loader = async () => {
  return new Response(NUDGE_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript",
      // Cache for 1 hour, allow stale for 24 hours while revalidating
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};
