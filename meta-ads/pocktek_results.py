"""
Pocktek - Meta Ads Results Fetcher
Pulls campaign, ad set, and ad performance data via API.
"""

import os
import json
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

ACCESS_TOKEN = os.getenv("FB_ACCESS_TOKEN")
AD_ACCOUNT_ID = os.getenv("FB_AD_ACCOUNT_ID")
API_VERSION = "v25.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

FIELDS_CAMPAIGN = "name,status,objective,daily_budget,lifetime_budget"
FIELDS_ADSET = "name,status,daily_budget,optimization_goal,targeting"
FIELDS_AD = "name,status,creative{id,name}"

INSIGHTS_FIELDS = [
    "impressions",
    "reach",
    "clicks",
    "spend",
    "cpc",
    "cpm",
    "ctr",
    "actions",
    "cost_per_action_type"
]

def api_call(endpoint, params=None):
    if params is None:
        params = {}
    params["access_token"] = ACCESS_TOKEN

    url = f"{BASE_URL}/{endpoint}"
    response = requests.get(url, params=params)

    if response.status_code != 200:
        print(f"API Error: {response.text}")
        return None

    return response.json()


def get_campaigns():
    result = api_call(f"act_{AD_ACCOUNT_ID}/campaigns", {
        "fields": FIELDS_CAMPAIGN,
        "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": "Pocktek"}])
    })
    return result.get("data", []) if result else []


def get_ad_sets(campaign_id=None):
    params = {"fields": FIELDS_ADSET}

    if campaign_id:
        endpoint = f"{campaign_id}/adsets"
    else:
        endpoint = f"act_{AD_ACCOUNT_ID}/adsets"
        params["filtering"] = json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": "Pocktek"}])

    result = api_call(endpoint, params)
    return result.get("data", []) if result else []


def get_ads(adset_id=None):
    params = {"fields": FIELDS_AD}

    if adset_id:
        endpoint = f"{adset_id}/ads"
    else:
        endpoint = f"act_{AD_ACCOUNT_ID}/ads"
        params["filtering"] = json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": "Pocktek"}])

    result = api_call(endpoint, params)
    return result.get("data", []) if result else []


def get_insights(object_id, level="ad", date_preset="last_7d"):
    params = {
        "fields": ",".join(INSIGHTS_FIELDS),
        "date_preset": date_preset
    }

    result = api_call(f"{object_id}/insights", params)

    if result and "data" in result and len(result["data"]) > 0:
        return result["data"][0]
    return None


def extract_link_clicks(insights):
    if not insights or "actions" not in insights:
        return 0

    for action in insights.get("actions", []):
        if action.get("action_type") == "link_click":
            return int(action.get("value", 0))
    return 0


def format_currency(value):
    try:
        return f"${float(value):.2f}"
    except (ValueError, TypeError):
        return "$0.00"


def format_percentage(value):
    try:
        return f"{float(value):.2f}%"
    except (ValueError, TypeError):
        return "0.00%"


def print_separator(char="=", length=70):
    print(char * length)


def fetch_all_results():
    print_separator()
    print("POCKTEK - META ADS PERFORMANCE REPORT")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print_separator()

    campaigns = get_campaigns()

    if not campaigns:
        print("\nNo Pocktek campaigns found.")
        print("Note: New campaigns may take a few hours to appear after creation.")
        return None

    all_data = {
        "generated_at": datetime.now().isoformat(),
        "campaigns": []
    }

    for campaign in campaigns:
        campaign_id = campaign["id"]
        campaign_name = campaign["name"]
        campaign_status = campaign["status"]

        print(f"\n📊 CAMPAIGN: {campaign_name}")
        print(f"   ID: {campaign_id} | Status: {campaign_status}")

        campaign_insights = get_insights(campaign_id, level="campaign", date_preset="maximum")

        campaign_data = {
            "id": campaign_id,
            "name": campaign_name,
            "status": campaign_status,
            "insights": campaign_insights,
            "ad_sets": []
        }

        if campaign_insights:
            print(f"   Spend: {format_currency(campaign_insights.get('spend', 0))}")
            print(f"   Impressions: {campaign_insights.get('impressions', 0)}")
            print(f"   Reach: {campaign_insights.get('reach', 0)}")
            print(f"   Link Clicks: {extract_link_clicks(campaign_insights)}")
        else:
            print("   No data yet (ads may still be in review)")

        ad_sets = get_ad_sets(campaign_id)

        for adset in ad_sets:
            adset_id = adset["id"]
            adset_name = adset["name"]
            adset_status = adset["status"]

            print(f"\n   📁 AD SET: {adset_name}")
            print(f"      Status: {adset_status}")

            adset_insights = get_insights(adset_id, level="adset", date_preset="maximum")

            adset_data = {
                "id": adset_id,
                "name": adset_name,
                "status": adset_status,
                "insights": adset_insights,
                "ads": []
            }

            if adset_insights:
                impressions = int(adset_insights.get("impressions", 0))
                clicks = extract_link_clicks(adset_insights)
                spend = float(adset_insights.get("spend", 0))
                ctr = adset_insights.get("ctr", "0")

                print(f"      Spend: {format_currency(spend)}")
                print(f"      Impressions: {impressions}")
                print(f"      Link Clicks: {clicks}")
                print(f"      CTR: {format_percentage(ctr)}")

                if clicks > 0 and spend > 0:
                    cpc = spend / clicks
                    print(f"      CPC: {format_currency(cpc)}")
            else:
                print("      No data yet")

            ads = get_ads(adset_id)

            for ad in ads:
                ad_id = ad["id"]
                ad_name = ad["name"]
                ad_status = ad["status"]

                print(f"\n      📢 AD: {ad_name}")
                print(f"         Status: {ad_status}")

                ad_insights = get_insights(ad_id, level="ad", date_preset="maximum")

                ad_data = {
                    "id": ad_id,
                    "name": ad_name,
                    "status": ad_status,
                    "insights": ad_insights
                }

                if ad_insights:
                    impressions = int(ad_insights.get("impressions", 0))
                    clicks = extract_link_clicks(ad_insights)
                    spend = float(ad_insights.get("spend", 0))
                    ctr = ad_insights.get("ctr", "0")

                    print(f"         Spend: {format_currency(spend)}")
                    print(f"         Impressions: {impressions}")
                    print(f"         Link Clicks: {clicks}")
                    print(f"         CTR: {format_percentage(ctr)}")

                    if clicks > 0 and spend > 0:
                        cpc = spend / clicks
                        print(f"         CPC: {format_currency(cpc)}")
                else:
                    print("         No data yet")

                adset_data["ads"].append(ad_data)

            campaign_data["ad_sets"].append(adset_data)

        all_data["campaigns"].append(campaign_data)

    print_separator()
    print("END OF REPORT")
    print_separator()

    return all_data


if __name__ == "__main__":
    print("\nFetching Pocktek Meta Ads results...\n")
    fetch_all_results()
