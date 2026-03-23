(function () {
  'use strict';
  

  const userId = (function () {
  let id = localStorage.getItem("nudge_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("nudge_user_id", id);
  }
  return id;
})();



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

  // ===== CONFIG (will be fetched from server) =====
  let CONFIG = {
    enabled: true,
    discount: 10,
    delay: 4000
  };

  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes nudgeImageFloat {
      0% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-6px) rotate(2deg); }
      100% { transform: translateY(0px) rotate(0deg); }
    }
  `;
  document.head.appendChild(style);

  let interacted = false;
  let addedToCart = false;
  let bannerShown = false;

  // ===== INTERACTION TRACKING =====
  const markInteraction = () => {
    interacted = true;
    console.log("[Nudge] User interacted → suppress");
  };

  setTimeout(() => {
  document.addEventListener('click', markInteraction);
  document.addEventListener('keydown', markInteraction);  
}, 2000);

  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    if (Math.abs(window.scrollY - lastScrollY) > 150) {
      interacted = true;
      console.log("[Nudge] User scrolled → suppress");
    }
  });

  // ===== ADD TO CART DETECTION =====
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, input[type="submit"]');
    if (!btn) return;

    const text = btn.innerText?.toLowerCase() || "";

    if (text.includes('add to cart') || text.includes('buy')) {
      addedToCart = true;
      console.log("[Nudge] Add to cart detected → suppress");
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.action?.includes('/cart/add')) {
      addedToCart = true;
      console.log("[Nudge] Cart form submit → suppress");
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

  // ===== BANNER UI =====
  const showBanner = () => {
    if (bannerShown) return;
    if (sessionStorage.getItem("nudge_closed")) return;

    const { title, image, variantId } = getProductData();

    if (!variantId) {
      console.log("[Nudge] No variant ID found → abort");
      return;
    }

    bannerShown = true;
    track("banner_shown", { delay: CONFIG.delay });

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
      track("banner_closed", { delay: CONFIG.delay });
      sessionStorage.setItem("nudge_closed", "1");
      container.remove();
    };

    console.log("[Nudge] Banner shown with config:", CONFIG);
  };

  // ===== FETCH CONFIG AND START =====
  const init = async () => {

    try {
      const res = await fetch("/apps/nudge/get-config?shop=" + window.Shopify.shop);
      const data = await res.json();
      CONFIG = { ...CONFIG, ...data };
      // 🔥 EXPERIMENT MODE (temporary)
      if (!CONFIG.delay || CONFIG.delay === 4000) {
        const delays = [3000, 8000, 15000];
        CONFIG.delay = delays[Math.floor(Math.random() * delays.length)];
        console.log("[Nudge] Experiment delay:", CONFIG.delay);
      }
      console.log("[Nudge] Config loaded:", CONFIG);
    } catch (err) {
      console.log("[Nudge] Using default config");
    }

    // Check if nudge is enabled
    if (!CONFIG.enabled) {
      console.log("[Nudge] Disabled by config");
      return;
    }

    // 🔥 START TIMER IMMEDIATELY
    let timerStart = Date.now();

    function fireBanner() {
      if (!interacted && !addedToCart) {
        console.log("[Nudge] Trigger conditions met");
        showBanner();
      } else {
        console.log("[Nudge] Conditions not met");
      }
    }

    let timer = setTimeout(fireBanner, CONFIG.delay);

    // 🔥 THEN fetch profile (inside init!)
    try {
      const res = await fetch("/apps/nudge/user-profile?userId=" + userId);
      const profile = await res.json();

      if (profile.exists && profile.suppress) {
          console.log("[Nudge] Suppressed by behavior");
          clearTimeout(timer);
          return;
}

      if (profile.exists && profile.personalBestDelay) {
          const elapsed = Date.now() - timerStart;

          if (elapsed < profile.personalBestDelay) {
            clearTimeout(timer);

            const remaining = profile.personalBestDelay - elapsed;
            CONFIG.delay = profile.personalBestDelay;

            timer = setTimeout(fireBanner, remaining);

            console.log("[Nudge] Using personal delay:", CONFIG.delay);
            console.log("[Nudge] Timer rescheduled:", remaining);
          }
        }

    } catch (err) {
      console.log("[Nudge] No profile yet");
    }

  };

  // Start the script
  init();

})();
