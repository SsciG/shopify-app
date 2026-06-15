"""
Check conversion actions (add to cart, checkout, purchase) for campaigns
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

ACCESS_TOKEN = os.getenv("FB_ACCESS_TOKEN")
AD_ACCOUNT_ID = os.getenv("FB_AD_ACCOUNT_ID")
API_VERSION = "v25.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

INSIGHTS_FIELDS = [
    "campaign_name",
    "spend",
    "impressions",
    "clicks",
    "actions",
    "action_values",
    "cost_per_action_type",
    "purchase_roas"
]

def get_campaign_conversions(campaign_filter="Coupon Pulse"):
    """Get conversion data for campaigns."""

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/insights"
    params = {
        "access_token": ACCESS_TOKEN,
        "fields": ",".join(INSIGHTS_FIELDS),
        "date_preset": "maximum",
        "level": "campaign",
        "filtering": json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": campaign_filter}])
    }

    response = requests.get(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error: {data['error']}")
        return

    print("=" * 60)
    print(f"CONVERSION DATA - {campaign_filter}")
    print("=" * 60)

    for row in data.get("data", []):
        print(f"\nCampaign: {row.get('campaign_name')}")
        print(f"Spend: ${float(row.get('spend', 0)):.2f}")
        print(f"Impressions: {row.get('impressions')}")

        actions = row.get("actions", [])
        if actions:
            print("\nAll Actions:")
            for action in actions:
                action_type = action.get("action_type", "")
                value = action.get("value", 0)

                # Highlight conversion actions
                if action_type in ["purchase", "add_to_cart", "initiate_checkout", "add_payment_info", "complete_registration"]:
                    print(f"  ** {action_type}: {value}")
                else:
                    print(f"     {action_type}: {value}")
        else:
            print("\nNo actions recorded yet.")

        # Check action values (purchase value)
        action_values = row.get("action_values", [])
        if action_values:
            print("\nAction Values (Revenue):")
            for av in action_values:
                print(f"  {av.get('action_type')}: ${float(av.get('value', 0)):.2f}")

        # ROAS
        roas = row.get("purchase_roas", [])
        if roas:
            print(f"\nROAS: {roas}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    get_campaign_conversions("Coupon Pulse")
