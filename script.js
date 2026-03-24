(function () {
  'use strict';

  // ===== DEDUPLICATION GUARD =====
  if (window.__nudgeLoaded) return;
  window.__nudgeLoaded = true;

  // ===== DEBUG MODE =====
  const DEBUG = window.location.search.includes('nudge_debug') || localStorage.getItem('nudge_debug') === '1';

  function log(...args) {
    if (DEBUG) console.log("[Nudge]", ...args);
  }

  function warn(...args) {
    if (DEBUG) console.warn("[Nudge]", ...args);
  }

  // ===== USER ID =====
  const userId = (function () {
    let id = localStorage.getItem("nudge_user_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("nudge_user_id", id);
    }
    return id;
  })();

  // ===== SAFE FETCH =====
  async function safeFetch(url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        warn("Fetch failed:", url, res.status);
        return null;
      }
      return res;
    } catch (e) {
      warn("Fetch error:", url, e);
      return null;
    }
  }

  // ===== TRACKING =====
  function track(event, data = {}) {
    fetch("/apps/nudge/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        userId,
        event,
        ts: Date.now(),
        ...data
      })
    }).catch(() => {});
  }

  // ===== CONFIG =====
  let CONFIG = {
    enabled: true,
    discount: 10,
    delay: 4000
  };

  // ===== INIT GUARD =====
  let initInProgress = false;

  // ===== STYLES =====
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes nudgeImageFloat {
      0% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-6px) rotate(2deg); }
      100% { transform: translateY(0px) rotate(0deg); }
    }
  `;
  document.head.appendChild(style);

  // ===== STATE =====
  let interacted = false;
  let addedToCart = false;
  let bannerShown = false;

  // =====================================================
  // THEME-AGNOSTIC DETECTION LAYER
  // =====================================================

  // 1. PRODUCT DETECTION (multi-layer fallback)
  function getProduct() {
    // Layer 1: Shopify standard meta (best - most themes have this)
    if (window.meta?.product) {
      log("Product found via window.meta");
      return window.meta.product;
    }

    // Layer 2: ShopifyAnalytics (common on newer themes)
    if (window.ShopifyAnalytics?.meta?.product) {
      log("Product found via ShopifyAnalytics");
      return window.ShopifyAnalytics.meta.product;
    }

    // Layer 3: JSON-LD structured data (iterate ALL, not just first)
    const jsonLds = document.querySelectorAll('script[type="application/ld+json"]');
    for (const el of jsonLds) {
      try {
        const data = JSON.parse(el.textContent);
        if (data["@type"] === "Product") {
          log("Product found via JSON-LD");
          return { title: data.name, id: data.productID };
        }
        // Handle @graph arrays (common in some themes)
        if (data["@graph"]) {
          const product = data["@graph"].find(item => item["@type"] === "Product");
          if (product) {
            log("Product found via JSON-LD @graph");
            return { title: product.name, id: product.productID };
          }
        }
      } catch {}
    }

    // Layer 4: Product JSON script (many themes embed this)
    const productJson = document.querySelector('script[type="application/json"][data-product-json]') ||
                        document.querySelector('script#ProductJson') ||
                        document.querySelector('[data-product-json]');
    if (productJson) {
      try {
        log("Product found via embedded JSON");
        return JSON.parse(productJson.textContent);
      } catch {}
    }

    // Layer 5: URL-based detection
    const match = window.location.pathname.match(/\/products\/([^\/\?]+)/);
    if (match) {
      log("Product detected via URL:", match[1]);
      return { handle: match[1] };
    }

    return null;
  }

  // 2. VARIANT ID DETECTION (critical for discount redirect)
  function getVariantId() {
    // Layer 1: Standard cart form input
    const input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    if (input?.value) {
      log("Variant found via form input:", input.value);
      return input.value;
    }

    // Layer 2: Select element (some themes use this)
    const select = document.querySelector('form[action*="/cart/add"] select[name="id"]');
    if (select?.value) {
      log("Variant found via select:", select.value);
      return select.value;
    }

    // Layer 3: ShopifyAnalytics selected variant
    if (window.ShopifyAnalytics?.meta?.selectedVariantId) {
      log("Variant found via ShopifyAnalytics:", window.ShopifyAnalytics.meta.selectedVariantId);
      return window.ShopifyAnalytics.meta.selectedVariantId;
    }

    // Layer 4: URL variant parameter
    const params = new URLSearchParams(window.location.search);
    const urlVariant = params.get("variant");
    if (urlVariant) {
      log("Variant found via URL:", urlVariant);
      return urlVariant;
    }

    // Layer 5: First variant ONLY if single variant product (safe)
    const product = getProduct();
    if (product?.variants?.length === 1 && product.variants[0]?.id) {
      log("Variant found via single-variant product:", product.variants[0].id);
      return product.variants[0].id;
    }

    // Layer 6: Hidden input fallback
    const hiddenInput = document.querySelector('input[name="id"][type="hidden"]');
    if (hiddenInput?.value) {
      log("Variant found via hidden input:", hiddenInput.value);
      return hiddenInput.value;
    }

    warn("No variant ID found");
    return null;
  }

  // 3. IMAGE DETECTION (don't hardcode theme classes)
  function getProductImage() {
    // Layer 1: Product images by URL pattern - prioritize VISIBLE in viewport
    const productImages = [...document.querySelectorAll('img[src*="/products/"]')];
    const visibleProductImg = productImages.find(img => {
      const rect = img.getBoundingClientRect();
      // Check if image is in viewport and reasonably sized (not thumbnail)
      return rect.top >= 0 && rect.top < window.innerHeight && rect.width > 100;
    });
    if (visibleProductImg?.src) {
      log("Image found via visible product img");
      return visibleProductImg.currentSrc || visibleProductImg.src;
    }

    // Layer 2: Common product image classes (various themes)
    const selectors = [
      'img.product-media__image',           // Dawn
      'img.product__media-item',            // Debut
      'img.ProductItem-image',              // Minimal
      'img.product-featured-media',         // Brooklyn
      'img[class*="product"][class*="image"]',
      'img[class*="Product"][class*="image"]',
      'img[class*="featured"][class*="image"]',
      '.product-single__photo img',
      '.product__photo img',
      '.product-image img',
      '[data-product-image] img',
      '[data-product-featured-image]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.src) {
        log("Image found via selector:", sel);
        return el.currentSrc || el.src;
      }
    }

    // Layer 3: First product image (any) as fallback
    if (productImages[0]?.src) {
      log("Image found via first product img fallback");
      return productImages[0].currentSrc || productImages[0].src;
    }

    // Layer 4: First large CDN image on page (last resort)
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      if (img.naturalWidth > 200 && img.src.includes('/cdn.shopify.com/')) {
        log("Image found via CDN fallback");
        return img.currentSrc || img.src;
      }
    }

    warn("No product image found");
    return "";
  }

  // 4. TITLE DETECTION
  function getProductTitle() {
    // Layer 1: Product meta
    const product = getProduct();
    if (product?.title) return product.title;

    // Layer 2: H1 with product-related class
    const productH1 = document.querySelector('h1.product__title, h1.product-title, h1[class*="product"]');
    if (productH1?.innerText) return productH1.innerText.trim();

    // Layer 3: Any H1
    const h1 = document.querySelector('h1');
    if (h1?.innerText) return h1.innerText.trim();

    // Layer 4: Document title (strip store name)
    const title = document.title.split('|')[0].split('–')[0].split('-')[0].trim();
    return title || "Product";
  }

  // 5. COMBINED PRODUCT DATA
  function getProductData() {
    return {
      title: getProductTitle(),
      image: getProductImage(),
      variantId: getVariantId(),
      product: getProduct()
    };
  }

  // =====================================================
  // INTERACTION & CART DETECTION
  // =====================================================

  const markInteraction = () => {
    interacted = true;
    log("User interacted → suppress");
  };

  // Delayed interaction tracking (give user time to settle)
  setTimeout(() => {
    document.addEventListener('click', markInteraction);
    document.addEventListener('keydown', markInteraction);
  }, 2000);

  // Scroll tracking (throttled for performance)
  let lastScrollY = window.scrollY;
  let scrollTimeout = null;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;

    scrollTimeout = setTimeout(() => {
      if (Math.abs(window.scrollY - lastScrollY) > 150) {
        interacted = true;
        log("User scrolled → suppress");
      }
      scrollTimeout = null;
    }, 100);
  });

  // ADD TO CART DETECTION (form-based, not text-based)
  document.addEventListener('submit', (e) => {
    const form = e.target;
    // Check form action - works regardless of language/button text
    if (form.action && form.action.includes('/cart/add')) {
      addedToCart = true;
      log("Cart form submit → suppress");
    }
  });

  // Fallback: AJAX cart detection (safer Proxy approach)
  try {
    window.fetch = new Proxy(window.fetch, {
      apply(target, thisArg, args) {
        try {
          const url = args[0]?.url || args[0];
          if (typeof url === 'string' && url.includes('/cart/add')) {
            addedToCart = true;
            log("AJAX cart add detected → suppress");
          }
        } catch {}
        return Reflect.apply(target, thisArg, args);
      }
    });
  } catch (e) {
    warn("Could not proxy fetch:", e);
  }

  // Also intercept XHR for older themes (safer approach)
  try {
    const originalXHR = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      try {
        if (typeof url === 'string' && url.includes('/cart/add')) {
          addedToCart = true;
          log("XHR cart add detected → suppress");
        }
      } catch {}
      return originalXHR.call(this, method, url, ...rest);
    };
  } catch (e) {
    warn("Could not intercept XHR:", e);
  }

  // ===== BANNER UI =====
  const showBanner = () => {
    if (bannerShown) return;
    if (sessionStorage.getItem("nudge_closed")) return;

    const { title, image, variantId } = getProductData();

    if (!variantId) {
      warn("No variant ID found → abort");
      return;
    }

    bannerShown = true;
    log("Banner shown with delay:", CONFIG.delay);
    track("banner_shown", { delay: CONFIG.delay });

    const container = document.createElement('div');
    container.setAttribute('data-nudge-banner', 'true');

    container.style.position = 'fixed';
    container.style.bottom = '20%';
    container.style.right = '20px';
    container.style.zIndex = '2147483647'; // max safe z-index
    container.style.background = '#fff';
    container.style.border = '1px solid #ddd';
    container.style.borderRadius = '10px';
    container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
    container.style.padding = '12px';
    container.style.width = '280px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.animation = 'fadeIn 0.3s ease';

    container.innerHTML = `
      <div style="display:flex; gap:10px;">
        <img src="${image}"
          style="width:60px;height:60px;object-fit:cover;border-radius:6px;
                 animation: nudgeImageFloat 4s ease-in-out infinite;
                 will-change: transform;" />

        <div style="flex:1;">
          <div style="font-size:14px;font-weight:bold;margin-bottom:4px;">
            Still thinking?
          </div>

          <div style="font-size:11px;color:#888;margin-bottom:6px;">
            🔥 ${Math.floor(Math.random() * 18) + 5} people viewed this recently
          </div>

          <div style="font-size:12px;color:#555;margin-bottom:8px;">
            Get ${CONFIG.discount}% off ${title}
          </div>

          <a href="#" id="nudge-btn"
             style="display:block;background:#000;color:#fff;text-align:center;padding:8px;border-radius:6px;font-size:13px;text-decoration:none;">
             Get Discount
          </a>
        </div>

        <div style="cursor:pointer;font-size:14px;" id="nudge-close">✕</div>
      </div>
    `;

    container.querySelector('#nudge-btn').onclick = (e) => {
      e.preventDefault();

      track("banner_clicked", { delay: CONFIG.delay });

      fetch("/apps/nudge/create-discount?shop=" + window.Shopify.shop)
        .then(r => r.json())
        .then(data => {
          window.location.href = `/discount/${data.code}?redirect=/cart/${variantId}:1`;
        });
    };

    document.body.appendChild(container);

    // Close button
    container.querySelector('#nudge-close').onclick = () => {
      log("Banner closed by user");
      track("banner_closed", { delay: CONFIG.delay });
      sessionStorage.setItem("nudge_closed", "1");
      container.remove();
    };
  };

  // =====================================================
  // PAGE CONTEXT DETECTION
  // =====================================================

  function isProductPage() {
    // Check URL pattern
    if (window.location.pathname.match(/\/products\/[^\/]+/)) {
      return true;
    }

    // Check for product data presence
    if (getProduct()) {
      return true;
    }

    // Check for add-to-cart form
    if (document.querySelector('form[action*="/cart/add"]')) {
      return true;
    }

    return false;
  }

  // =====================================================
  // INITIALIZATION
  // =====================================================

  let currentTimer = null;
  let lastProductHandle = null;

  const resetState = () => {
    // Reset state for new product page
    interacted = false;
    addedToCart = false;
    bannerShown = false;
    lastScrollY = window.scrollY;

    // Clear existing timer
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }

    // Remove existing banner if present
    const existingBanner = document.querySelector('[data-nudge-banner]');
    if (existingBanner) {
      existingBanner.remove();
    }
  };

  const init = async () => {
    // Guard against double init
    if (initInProgress) {
      log("Init already in progress → skip");
      return;
    }

    // Only run on product pages
    if (!isProductPage()) {
      log("Not a product page → skip");
      return;
    }

    // Check if same product (SPA navigation back to same page)
    const product = getProduct();
    const currentHandle = product?.handle || window.location.pathname;
    if (currentHandle === lastProductHandle && bannerShown) {
      log("Same product, already shown → skip");
      return;
    }

    initInProgress = true;
    lastProductHandle = currentHandle;

    // Reset state for fresh start (also clears any existing timer)
    resetState();

    log("Initializing on product page:", currentHandle);

    // Health check
    log("Health check:", {
      product: !!getProduct(),
      variant: !!getVariantId(),
      image: !!getProductImage()
    });

    try {
      // Fetch config
      const configRes = await safeFetch("/apps/nudge/get-config?shop=" + window.Shopify.shop);
      if (configRes) {
        try {
          const data = await configRes.json();
          CONFIG = { ...CONFIG, ...data };

          // Experiment mode
          if (!CONFIG.delay || CONFIG.delay === 4000) {
            const delays = [3000, 8000, 15000];
            CONFIG.delay = delays[Math.floor(Math.random() * delays.length)];
            log("Experiment delay:", CONFIG.delay);
          }
          log("Config loaded:", CONFIG);
        } catch (err) {
          log("Config parse error, using defaults");
        }
      } else {
        log("Using default config");
      }

      // Check if nudge is enabled
      if (!CONFIG.enabled) {
        log("Disabled by config");
        return;
      }

      // Start timer
      const timerStart = Date.now();

      function fireBanner() {
        if (!interacted && !addedToCart) {
          log("Trigger conditions met");
          showBanner();
        } else {
          log("Conditions not met:", { interacted, addedToCart });
        }
      }

      // Clear any existing timer before setting new one
      if (currentTimer) {
        clearTimeout(currentTimer);
      }
      currentTimer = setTimeout(fireBanner, CONFIG.delay);

      // Fetch user profile for personalization
      const profileRes = await safeFetch("/apps/nudge/user-profile?userId=" + userId);
      if (profileRes) {
        try {
          const profile = await profileRes.json();

          if (profile.exists && profile.suppress) {
            log("Suppressed by behavior");
            if (currentTimer) {
              clearTimeout(currentTimer);
              currentTimer = null;
            }
            return;
          }

          if (profile.exists && profile.personalBestDelay) {
            const elapsed = Date.now() - timerStart;

            if (elapsed < profile.personalBestDelay) {
              if (currentTimer) {
                clearTimeout(currentTimer);
              }

              const remaining = profile.personalBestDelay - elapsed;
              CONFIG.delay = profile.personalBestDelay;

              currentTimer = setTimeout(fireBanner, remaining);

              log("Using personal delay:", CONFIG.delay);
              log("Timer rescheduled:", remaining);
            }
          }
        } catch (err) {
          log("Profile parse error");
        }
      } else {
        log("No profile yet");
      }

    } catch (e) {
      warn("Init failed:", e);
    } finally {
      // Guarantee flag reset even on error
      initInProgress = false;
    }
  };

  // =====================================================
  // SPA NAVIGATION HANDLING
  // =====================================================

  // Handle Shopify section reloads (Dawn, etc.)
  document.addEventListener("shopify:section:load", () => {
    log("Section reload detected");
    setTimeout(init, 100); // Small delay for DOM to settle
  });

  // Handle History API navigation (SPA themes)
  try {
    const originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      log("pushState navigation detected");
      setTimeout(init, 100);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      // Don't reinit on replaceState (usually same page)
    };
  } catch (e) {
    warn("Could not intercept History API:", e);
  }

  window.addEventListener("popstate", () => {
    log("popstate navigation detected");
    setTimeout(init, 100);
  });

  // =====================================================
  // STARTUP (with fail-safe)
  // =====================================================

  function safeInit() {
    try {
      init();
    } catch (e) {
      warn("Init failed safely:", e);
    }
  }

  // Handle script timing
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit);
  } else {
    // DOM already ready
    safeInit();
  }

  // Export debug helper
  window.__nudgeDebug = {
    getState: () => ({ interacted, addedToCart, bannerShown, CONFIG, initInProgress }),
    getProduct,
    getVariantId,
    getProductImage,
    forceShow: () => { bannerShown = false; showBanner(); },
    reset: resetState
  };

  log("Script loaded", { DEBUG });

})();
