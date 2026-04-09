import { useLoaderData, useRevalidator } from "react-router";
import prisma from "../db.server";

// SECURITY: Admin dashboard protected by secret key
// Set ADMIN_SECRET in your .env file
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production";

// Action handler for activate/deactivate
export const action = async ({ request }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  // Auth check
  if (key !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const body = await request.json();
  const { shop, action: actionType, plan } = body;

  if (!shop) {
    return new Response(JSON.stringify({ error: "Missing shop" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    if (actionType === "activate") {
      await prisma.storeSettings.upsert({
        where: { shop },
        update: { isActive: true, plan: plan || "pro" },
        create: { shop, isActive: true, plan: plan || "pro" }
      });
      return new Response(JSON.stringify({ success: true, message: `Activated ${shop}` }), {
        headers: { "Content-Type": "application/json" }
      });
    } else if (actionType === "deactivate") {
      await prisma.storeSettings.update({
        where: { shop },
        data: { isActive: false }
      });
      return new Response(JSON.stringify({ success: true, message: `Deactivated ${shop}` }), {
        headers: { "Content-Type": "application/json" }
      });
    } else if (actionType === "delete") {
      // Delete shop and all related data
      await prisma.$transaction([
        prisma.event.deleteMany({ where: { shop } }),
        prisma.discountCode.deleteMany({ where: { shop } }),
        prisma.override.deleteMany({ where: { shop } }),
        prisma.storeSettings.delete({ where: { shop } })
      ]);
      return new Response(JSON.stringify({ success: true, message: `Deleted ${shop}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  // Auth check
  if (key !== ADMIN_SECRET) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Get all shops with their settings
  const shops = await prisma.storeSettings.findMany({
    orderBy: { updatedAt: "desc" }
  });

  // Get per-shop analytics
  const shopStats = await Promise.all(
    shops.map(async (shop) => {
      const [impressions, clicks, conversions, revenue, lastEvent] = await Promise.all([
        prisma.event.count({
          where: { shop: shop.shop, event: "banner_shown" }
        }),
        prisma.event.count({
          where: { shop: shop.shop, event: "banner_clicked" }
        }),
        prisma.event.count({
          where: { shop: shop.shop, event: "converted" }
        }),
        prisma.discountCode.aggregate({
          where: { shop: shop.shop, used: true },
          _sum: { orderTotal: true }
        }),
        prisma.event.findFirst({
          where: { shop: shop.shop },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        })
      ]);

      return {
        shop: shop.shop,
        isActive: shop.isActive,
        plan: shop.plan,
        billingId: shop.billingId,
        enabled: shop.enabled,
        createdAt: shop.createdAt,
        updatedAt: shop.updatedAt,
        impressions,
        clicks,
        conversions,
        revenue: revenue._sum?.orderTotal || 0,
        ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : 0,
        cvr: impressions > 0 ? ((conversions / impressions) * 100).toFixed(1) : 0,
        lastActivity: lastEvent?.createdAt || null
      };
    })
  );

  // Global totals
  const totals = {
    shops: shops.length,
    activeShops: shops.filter(s => s.isActive).length,
    impressions: shopStats.reduce((sum, s) => sum + s.impressions, 0),
    clicks: shopStats.reduce((sum, s) => sum + s.clicks, 0),
    conversions: shopStats.reduce((sum, s) => sum + s.conversions, 0),
    revenue: shopStats.reduce((sum, s) => sum + s.revenue, 0)
  };

  totals.ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(1) : 0;
  totals.cvr = totals.impressions > 0 ? ((totals.conversions / totals.impressions) * 100).toFixed(1) : 0;

  return { shopStats, totals };
};

export default function AdminDashboard() {
  const { shopStats, totals } = useLoaderData();
  const revalidator = useRevalidator();

  const formatDate = (date) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const handleAction = async (shop, action, plan = null) => {
    const key = new URLSearchParams(window.location.search).get("key");
    const confirmed = action === "delete"
      ? window.confirm(`Delete ${shop} and all its data? This cannot be undone.`)
      : true;

    if (!confirmed) return;

    try {
      // Use GET request via admin-action route (works better with proxies)
      const params = new URLSearchParams({ key, shop, action });
      if (plan) params.set("plan", plan);

      const res = await fetch(`/admin-action?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        revalidator.revalidate();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 24 }}>🔐 Nudge Admin Dashboard</h1>

      {/* Global Stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 16,
        marginBottom: 32
      }}>
        <StatCard label="Total Shops" value={totals.shops} />
        <StatCard label="Active (Paid)" value={totals.activeShops} color={totals.activeShops > 0 ? "#4caf50" : "#999"} />
        <StatCard label="Impressions" value={totals.impressions.toLocaleString()} />
        <StatCard label="Clicks" value={totals.clicks.toLocaleString()} />
        <StatCard label="Conversions" value={totals.conversions.toLocaleString()} />
        <StatCard label="Revenue" value={`$${totals.revenue.toFixed(2)}`} color="#4caf50" />
        <StatCard label="CTR" value={`${totals.ctr}%`} />
        <StatCard label="CVR" value={`${totals.cvr}%`} />
      </div>

      {/* Per-Shop Table */}
      <h2 style={{ marginBottom: 16 }}>Shops</h2>
      {shopStats.length === 0 ? (
        <p style={{ color: "#666" }}>No shops installed yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd" }}>Shop</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "center" }}>Status</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "right" }}>Impressions</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "right" }}>Clicks</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "right" }}>Conversions</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "right" }}>Revenue</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "right" }}>CTR</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "right" }}>CVR</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd" }}>Last Activity</th>
                <th style={{ padding: 12, borderBottom: "2px solid #ddd", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shopStats.map((shop, idx) => (
                <tr key={shop.shop} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    <div style={{ fontWeight: 500 }}>{shop.shop}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>
                      Installed: {formatDate(shop.createdAt)}
                    </div>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "center" }}>
                    {shop.isActive ? (
                      <span style={{
                        background: "#e8f5e9",
                        color: "#2e7d32",
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: 12
                      }}>
                        ✓ Active
                      </span>
                    ) : (
                      <span style={{
                        background: "#fff3e0",
                        color: "#e65100",
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: 12
                      }}>
                        Unpaid
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "right" }}>
                    {shop.impressions.toLocaleString()}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "right" }}>
                    {shop.clicks.toLocaleString()}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "right" }}>
                    {shop.conversions.toLocaleString()}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "right", color: shop.revenue > 0 ? "#2e7d32" : "inherit", fontWeight: shop.revenue > 0 ? 600 : 400 }}>
                    ${shop.revenue.toFixed(2)}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "right" }}>
                    {shop.ctr}%
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "right", color: parseFloat(shop.cvr) > 3 ? "#2e7d32" : "inherit" }}>
                    {shop.cvr}%
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", fontSize: 12, color: "#666" }}>
                    {formatDate(shop.lastActivity)}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                      {shop.isActive ? (
                        <button
                          onClick={() => handleAction(shop.shop, "deactivate")}
                          style={{
                            padding: "6px 12px",
                            background: "#ff9800",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 12
                          }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleAction(shop.shop, "activate", "starter")}
                            style={{
                              padding: "6px 12px",
                              background: "#2196f3",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Starter
                          </button>
                          <button
                            onClick={() => handleAction(shop.shop, "activate", "pro")}
                            style={{
                              padding: "6px 12px",
                              background: "#4caf50",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Pro
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleAction(shop.shop, "delete")}
                        style={{
                          padding: "6px 12px",
                          background: "#f44336",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: 16, background: "#f5f5f5", borderRadius: 8, fontSize: 12, color: "#666" }}>
        <strong>Access URL:</strong> /admin?key=YOUR_ADMIN_SECRET<br />
        <strong>Tip:</strong> Set ADMIN_SECRET in your .env file for production security.
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "#333" }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e0e0e0",
      borderRadius: 8,
      padding: 16,
      textAlign: "center"
    }}>
      <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{label}</div>
    </div>
  );
}
