"""
Update ad set budget for Pocktek - Tech Enthusiasts
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

# New daily budget: $25/day per ad set = 2500 cents ($50/day total = $350/week)
NEW_DAILY_BUDGET = 2500

def get_pocktek_adsets():
    """Get Pocktek ad sets."""
    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adsets"
    params = {
        "access_token": ACCESS_TOKEN,
        "fields": "id,name,daily_budget,status",
        "filtering": json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": "Pocktek"}])
    }
    response = requests.get(url, params=params)
    return response.json().get("data", [])

def update_adset_budget(adset_id, daily_budget):
    """Update the daily budget for an ad set."""
    url = f"{BASE_URL}/{adset_id}"
    params = {
        "access_token": ACCESS_TOKEN,
        "daily_budget": daily_budget
    }
    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error: {data['error']}")
        return False

    print(f"Success! Budget updated to ${daily_budget/100:.2f}/day")
    return True

if __name__ == "__main__":
    print("Fetching Pocktek ad sets...\n")
    adsets = get_pocktek_adsets()

    for adset in adsets:
        print(f"  {adset['name']}")
        print(f"    ID: {adset['id']}")
        print(f"    Current budget: ${int(adset.get('daily_budget', 0))/100:.2f}/day")
        print()

    # Update ALL Pocktek ad sets to $25/day each
    for adset in adsets:
        print(f"Updating '{adset['name']}' to ${NEW_DAILY_BUDGET/100:.2f}/day...")
        update_adset_budget(adset["id"], NEW_DAILY_BUDGET)

    print(f"\nTotal daily budget: ${NEW_DAILY_BUDGET * len(adsets) / 100:.2f}/day")
