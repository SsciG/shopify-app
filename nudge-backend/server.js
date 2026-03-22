const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());
require('dotenv').config();


// 🔴 DATA
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// TEMP in-memory config (later DB)
const STORE_CONFIG = {};

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// 🔥 ROOT HANDLER
app.get('/', (req, res) => {
  console.log("🔥 ROOT GET", req.url);
  res.json({ ok: true });
});

// 🔹 SAVE CONFIG (from admin panel)
app.post('/save-config', (req, res) => {
  const { shop, config } = req.body;

  if (!shop) {
    return res.status(400).json({ error: "missing shop" });
  }

  STORE_CONFIG[shop] = config;
  console.log("CONFIG SAVED:", shop, config);

  res.json({ ok: true });
});

// 🔹 GET CONFIG (from storefront script via proxy)
app.get('/get-config', (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).json({ error: "missing shop" });
  }

  const config = STORE_CONFIG[shop] || {
    enabled: true,
    discount: 10,
    delay: 4000
  };

  res.json(config);
});

// 🔥 DISCOUNT ENDPOINT (dynamic per shop)
app.get('/create-discount', async (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).json({ error: "missing shop" });
  }

  const config = STORE_CONFIG[shop] || { discount: 10 };
  const discountValue = config.discount || 10;

  const code = "NUDGE_" + Math.random().toString(36).substring(2, 8).toUpperCase();

  console.log("🔥 HIT /create-discount", { shop, discountValue });

  try {
    const ruleRes = await fetch(`https://${shop}/admin/api/2024-01/price_rules.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN
      },
      body: JSON.stringify({
        price_rule: {
          title: code,
          target_type: "line_item",
          target_selection: "all",
          allocation_method: "across",
          value_type: "percentage",
          value: `-${discountValue}.0`,
          customer_selection: "all",
          starts_at: new Date().toISOString()
        }
      })
    });

    const ruleData = await ruleRes.json();
    console.log("FULL RULE RESPONSE:", ruleData);

    const ruleId = ruleData.price_rule.id;

    const discountRes = await fetch(`https://${shop}/admin/api/2024-01/price_rules/${ruleId}/discount_codes.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN
      },
      body: JSON.stringify({
        discount_code: { code }
      })
    });

    const discountData = await discountRes.json();
    console.log("DISCOUNT RESPONSE:", discountData);

    if (!discountData.discount_code) {
      return res.status(500).json({ error: discountData });
    }

    res.json({ code });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed" });
  }
});

app.listen(3000, () => console.log("Server running on 3000"));
