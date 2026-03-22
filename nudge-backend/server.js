const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());

// 🔴 DATA
const SHOP = "the-app-4.myshopify.com";
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

// CORS (fine)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// 🔥 ROOT HANDLER (THIS is what proxy hits)
app.get('/', (req, res) => {
  console.log("🔥 ROOT GET", req.url);
  res.json({ ok: true });
});

// 🔥 DISCOUNT ENDPOINT (we connect later)
app.get('/create-discount', async (req, res) => {
  console.log("🔥 HIT /create-discount");

  try {
    const code = "NUDGE_" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const ruleRes = await fetch(`https://${SHOP}/admin/api/2024-01/price_rules.json`, {
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
          value: "-10.0",
          customer_selection: "all",
          starts_at: new Date().toISOString()
        }
      })
    });

    const ruleData = await ruleRes.json();
    console.log("FULL RULE RESPONSE:", ruleData);  // 👈 ADD THIS LINE
    const ruleId = ruleData.price_rule.id;

    const discountRes = await fetch(`https://${SHOP}/admin/api/2024-01/price_rules/${ruleId}/discount_codes.json`, {
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
    console.log("DISCOUNT RESPONSE:", discountData);  // 👈 ADD

    if (!discountData.discount_code) {
      return res.status(500).json({ error: discountData });
    }

    res.set('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify({ code }));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed" });
  }
});

app.listen(3000, () => console.log("Server running on 3000"));