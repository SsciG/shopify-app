"""
Optimize both campaigns based on performance data
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

ACCESS_TOKEN = os.getenv('FB_ACCESS_TOKEN')
AD_ACCOUNT_ID = os.getenv('FB_AD_ACCOUNT_ID')
API_VERSION = 'v25.0'
BASE_URL = f'https://graph.facebook.com/{API_VERSION}'


def update_adset(adset_id, updates, name=""):
    """Update an ad set."""
    print(f"Updating {name} ({adset_id})...")

    url = f"{BASE_URL}/{adset_id}"
    params = {"access_token": ACCESS_TOKEN, **updates}

    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"  Error: {data['error'].get('message', data['error'])}")
        return False

    print(f"  Success: {updates}")
    return True


def get_adsets_by_campaign_name(campaign_name):
    """Get ad sets for a campaign by name."""
    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adsets"
    params = {
        "access_token": ACCESS_TOKEN,
        "fields": "id,name,daily_budget,status",
        "filtering": json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": campaign_name}])
    }

    response = requests.get(url, params=params)
    data = response.json()
    return data.get("data", [])


def main():
    print("=" * 60)
    print("OPTIMIZING CAMPAIGNS")
    print("=" * 60)

    # === POCKTEK ===
    print("\n--- POCKTEK ---")
    pocktek_adsets = get_adsets_by_campaign_name("Pocktek")

    for adset in pocktek_adsets:
        name = adset["name"]
        adset_id = adset["id"]

        if "Tech" in name:
            # Tech Enthusiasts winning - increase to $18/day (~$126/week)
            update_adset(adset_id, {"daily_budget": 1800}, name)
        elif "Broad" in name:
            # Broad less efficient - reduce to $4/day (~$28/week)
            update_adset(adset_id, {"daily_budget": 400}, name)

    # === COUPON PULSE ===
    print("\n--- COUPON PULSE ---")
    cp_adsets = get_adsets_by_campaign_name("Coupon Pulse")

    for adset in cp_adsets:
        name = adset["name"]
        adset_id = adset["id"]

        if "Broad Validation" in name:
            # $1.13 CPC is way too high - pause it
            update_adset(adset_id, {"status": "PAUSED"}, name)
        elif "Ecommerce" in name:
            # Keep this one, it's working at $0.36 CPC
            print(f"Keeping {name} as-is (good performance)")

    print("\n" + "=" * 60)
    print("OPTIMIZATION COMPLETE")
    print("=" * 60)
    print("""
Summary:
  Pocktek:
    - Tech Enthusiasts: $18/day (was $14.28)
    - Broad Audience: $4/day (was $7.14)
    - Total: $22/day (~$154/week)

  Coupon Pulse:
    - Broad Validation: PAUSED (was $1.13 CPC)
    - Ecommerce Operators: unchanged
""")


if __name__ == "__main__":
    main()
