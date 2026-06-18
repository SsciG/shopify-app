import { redirect } from "react-router";

export const loader = async () => {
  // Redirect to Shopify App Store - installation happens there
  return redirect("https://apps.shopify.com/coupon-pulse");
};

export default function Install() {
  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h1>Install Coupon Pulse</h1>
      <p>Redirecting to Shopify App Store...</p>
      <a href="https://apps.shopify.com/coupon-pulse">Click here if not redirected</a>
    </div>
  );
}
