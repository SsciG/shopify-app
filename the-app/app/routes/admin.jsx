import { useState, Fragment } from "react";
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
      // Get date 7 days ago for recent stats
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [
        impressions, clicks, conversions, revenue, lastEvent,
        impressions7d, clicks7d, conversions7d,
        triggerBreakdown
      ] = await Promise.all([
        // All time stats
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
        }),
        // Last 7 days stats
        prisma.event.count({
          where: { shop: shop.shop, event: "banner_shown", createdAt: { gte: sevenDaysAgo } }
        }),
        prisma.event.count({
          where: { shop: shop.shop, event: "banner_clicked", createdAt: { gte: sevenDaysAgo } }
        }),
        prisma.event.count({
          where: { shop: shop.shop, event: "converted", createdAt: { gte: sevenDaysAgo } }
        }),
        // Trigger type breakdown
        prisma.event.groupBy({
          by: ["triggerType"],
          where: { shop: shop.shop, event: "banner_shown", triggerType: { not: null } },
          _count: { triggerType: true }
        })
      ]);

      return {
        shop: shop.shop,
        isActive: shop.isActive,
        plan: shop.plan,
        billingId: shop.billingId,
        enabled: shop.enabled,
        subscriptionEndsAt: shop.subscriptionEndsAt,
        extensionNotes: shop.extensionNotes,
        createdAt: shop.createdAt,
        updatedAt: shop.updatedAt,
        // All time
        impressions,
        clicks,
        conversions,
        revenue: revenue._sum?.orderTotal || 0,
        ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : 0,
        cvr: impressions > 0 ? ((conversions / impressions) * 100).toFixed(1) : 0,
        lastActivity: lastEvent?.createdAt || null,
        // Last 7 days
        impressions7d,
        clicks7d,
        conversions7d,
        ctr7d: impressions7d > 0 ? ((clicks7d / impressions7d) * 100).toFixed(1) : 0,
        cvr7d: impressions7d > 0 ? ((conversions7d / impressions7d) * 100).toFixed(1) : 0,
        // Trigger breakdown
        triggerBreakdown: triggerBreakdown.reduce((acc, t) => {
          acc[t.triggerType] = t._count.triggerType;
          return acc;
        }, {})
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
  const [expandedShop, setExpandedShop] = useState(null);

  const formatDate = (date) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const toggleExpand = (shop) => {
    setExpandedShop(expandedShop === shop ? null : shop);
  };

  const handleAction = async (shop, action, plan = null) => {
    const key = new URLSearchParams(window.location.search).get("key");
    let confirmed = true;

    if (action === "delete") {
      confirmed = window.confirm(`Delete ${shop} and all its data? This cannot be undone.`);
    }

    if (!confirmed) return;

    const params = new URLSearchParams({ key, shop, action });
    if (plan) params.set("plan", plan);

    // Handle deactivation with optional discount offer
    if (action === "deactivate") {
      const sendDiscount = window.confirm(`Send discount offer to ${shop}?\n\nClick OK to send a 20% discount offer email, or Cancel to deactivate without offer.`);
      if (sendDiscount) {
        params.set("sendDiscount", "true");
      }
    }

    try {
      const url = `${window.location.origin}/admin-action?${params.toString()}`;
      console.log("Admin action URL:", url);

      const res = await fetch(url);
      console.log("Response status:", res.status);

      const data = await res.json();
      console.log("Response data:", data);

      if (data.success) {
        alert(data.message || "Success!");
        revalidator.revalidate();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      alert("Error: " + err.message);
    }
  };

  const handleExtend = async (shop) => {
    const key = new URLSearchParams(window.location.search).get("key");

    // Prompt for extension period
    const period = window.prompt(`Extend subscription for ${shop}\n\nEnter period (examples: "30 days", "2 weeks", "3 months"):`);
    if (!period) return;

    // Parse the period
    const match = period.match(/(\d+)\s*(day|week|month)s?/i);
    if (!match) {
      alert("Invalid format. Use: '30 days', '2 weeks', or '3 months'");
      return;
    }

    const amount = match[1];
    const unit = match[2].toLowerCase();

    const params = new URLSearchParams({ key, shop, action: "extend" });
    if (unit === "day") params.set("days", amount);
    else if (unit === "week") params.set("weeks", amount);
    else if (unit === "month") params.set("months", amount);

    // Optional note
    const note = window.prompt("Optional: Add a note for this extension (or leave blank):");
    if (note) params.set("note", note);

    try {
      const url = `${window.location.origin}/admin-action?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        alert(data.message || "Success!");
        revalidator.revalidate();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      alert("Error: " + err.message);
    }
  };

  const handleFreeTrial = async (shop) => {
    const key = new URLSearchParams(window.location.search).get("key");

    // Prompt for trial period
    const period = window.prompt(`Grant FREE TRIAL to ${shop}\n\nEnter trial period (examples: "7 days", "14 days", "1 month"):`);
    if (!period) return;

    // Parse the period
    const match = period.match(/(\d+)\s*(day|week|month)s?/i);
    if (!match) {
      alert("Invalid format. Use: '7 days', '2 weeks', or '1 month'");
      return;
    }

    const amount = match[1];
    const unit = match[2].toLowerCase();

    // Select plan for the trial
    const planChoice = window.prompt("Which plan features should they have during trial?\n\n1 = Starter\n2 = Pro\n3 = Enterprise\n\nEnter number:", "2");
    const planMap = { "1": "starter", "2": "pro", "3": "enterprise" };
    const plan = planMap[planChoice] || "pro";

    const params = new URLSearchParams({ key, shop, action: "trial", plan });
    if (unit === "day") params.set("days", amount);
    else if (unit === "week") params.set("weeks", amount);
    else if (unit === "month") params.set("months", amount);

    try {
      const url = `${window.location.origin}/admin-action?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        alert(data.message || "Success!");
        revalidator.revalidate();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err) {
      console.error("Fetch error:", err);
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
                <th style={{ padding: 12, borderBottom: "2px solid #ddd" }}>Subscription</th>
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
                <Fragment key={shop.shop}>
                <tr style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: 12, borderBottom: expandedShop === shop.shop ? "none" : "1px solid #eee" }}>
                    <div
                      style={{ fontWeight: 500, cursor: "pointer", color: "#1976d2" }}
                      onClick={() => toggleExpand(shop.shop)}
                    >
                      {expandedShop === shop.shop ? "▼" : "▶"} {shop.shop}
                    </div>
                    <div style={{ fontSize: 11, color: "#666", marginLeft: 16 }}>
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
                  <td style={{ padding: 12, borderBottom: "1px solid #eee", fontSize: 12 }}>
                    {shop.subscriptionEndsAt ? (
                      <div>
                        <div style={{ fontWeight: 500 }}>Ends: {formatDate(shop.subscriptionEndsAt)}</div>
                        {shop.extensionNotes && (
                          <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
                            Note: {shop.extensionNotes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "#999" }}>No expiration set</span>
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
                  <td style={{ padding: 12, borderBottom: expandedShop === shop.shop ? "none" : "1px solid #eee", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                      {shop.isActive ? (
                        <>
                          <button
                            onClick={() => handleExtend(shop.shop)}
                            style={{
                              padding: "6px 12px",
                              background: "#9c27b0",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Extend
                          </button>
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
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleFreeTrial(shop.shop)}
                            style={{
                              padding: "6px 12px",
                              background: "#ff9800",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            Free Trial
                          </button>
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
                          <button
                            onClick={() => handleAction(shop.shop, "activate", "enterprise")}
                            style={{
                              padding: "6px 12px",
                              background: "#673ab7",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Enterprise
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
                {/* Expanded shop details row */}
                {expandedShop === shop.shop && (
                  <tr style={{ background: "#f8f9fa" }}>
                    <td colSpan={11} style={{ padding: "16px 24px", borderBottom: "1px solid #eee" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
                        {/* Last 7 Days */}
                        <div>
                          <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#333" }}>📊 Last 7 Days</h4>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <MiniStat label="Impressions" value={shop.impressions7d} />
                            <MiniStat label="Clicks" value={shop.clicks7d} />
                            <MiniStat label="Conversions" value={shop.conversions7d} />
                            <MiniStat label="CTR" value={`${shop.ctr7d}%`} />
                            <MiniStat label="CVR" value={`${shop.cvr7d}%`} />
                          </div>
                        </div>

                        {/* Trigger Breakdown */}
                        <div>
                          <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#333" }}>🎯 Trigger Breakdown</h4>
                          {Object.keys(shop.triggerBreakdown || {}).length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {Object.entries(shop.triggerBreakdown).map(([trigger, count]) => (
                                <div key={trigger} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                  <span style={{ textTransform: "capitalize" }}>{trigger.replace("_", " ")}</span>
                                  <span style={{ fontWeight: 500 }}>{count}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 13, color: "#666" }}>No trigger data yet</div>
                          )}
                        </div>

                        {/* Shop Details */}
                        <div>
                          <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#333" }}>🏪 Shop Details</h4>
                          <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div><strong>Plan:</strong> {shop.plan || "None"}</div>
                            <div><strong>Billing ID:</strong> {shop.billingId || "N/A"}</div>
                            <div><strong>Banner Enabled:</strong> {shop.enabled ? "Yes" : "No"}</div>
                            <div><strong>Last Updated:</strong> {formatDate(shop.updatedAt)}</div>
                            {shop.subscriptionEndsAt && (
                              <div><strong>Subscription Ends:</strong> {formatDate(shop.subscriptionEndsAt)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
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

function MiniStat({ label, value }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e0e0e0",
      borderRadius: 4,
      padding: "8px 12px",
      textAlign: "center"
    }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#666" }}>{label}</div>
    </div>
  );
}
