"""
Switch Coupon Pulse from Traffic to Sales Campaign
1. Pauses existing Traffic campaign
2. Creates new Sales campaign optimized for Purchase events

Usage:
    python switch_to_sales.py
"""

import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

ACCESS_TOKEN = os.getenv("FB_ACCESS_TOKEN")
AD_ACCOUNT_ID = os.getenv("FB_AD_ACCOUNT_ID")
PAGE_ID = os.getenv("COUPON_PULSE_PAGE_ID") or os.getenv("FB_PAGE_ID")

if AD_ACCOUNT_ID and AD_ACCOUNT_ID.startswith("act_"):
    AD_ACCOUNT_ID = AD_ACCOUNT_ID[4:]

PIXEL_ID = "2786506521715348"
API_VERSION = "v25.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

LANDING_PAGE_URL = "https://couponpulse.co/"
UTM_BASE = "utm_source=meta&utm_medium=paid&utm_campaign=sales"
DAILY_BUDGET_CENTS = 1000  # $10/day

# Conversion event priority for SaaS:
# 1. CompleteRegistration - if registration exists
# 2. Lead - for early-access/signup
# 3. InitiateCheckout - if payment starts on site
# Use Lead for Coupon Pulse since it's SaaS signup flow
CONVERSION_EVENT = "LEAD"


def api_call(method, endpoint, data=None):
    """Make an API call to Meta Graph API."""
    url = f"{BASE_URL}/{endpoint}"
    params = {"access_token": ACCESS_TOKEN}

    if method == "GET":
        response = requests.get(url, params={**params, **(data or {})})
    else:
        response = requests.post(url, params=params, data=data)

    result = response.json()

    if "error" in result:
        print(f"API Error: {result['error']['message']}")
        print(f"Details: {json.dumps(result['error'], indent=2)}")
        return None

    return result


def pause_campaign(campaign_id):
    """Pause a campaign."""
    print(f"Pausing campaign {campaign_id}...")
    result = api_call("POST", campaign_id, {"status": "PAUSED"})
    if result:
        print("  Paused successfully")
        return True
    return False


def search_interests(query):
    """Search for valid interest targeting IDs."""
    result = api_call("GET", "search", {
        "type": "adinterest",
        "q": query,
        "limit": 10,
    })
    if result and "data" in result:
        return result["data"]
    return []


def get_ecommerce_interests():
    """Fetch valid interest IDs for ecommerce/Shopify targeting."""
    print("\nFinding ecommerce interests...")

    # Removed Dropshipping - can bring low-quality "get rich quick" users
    search_terms = ["Shopify", "E-commerce", "Small business"]
    ALLOWED_PATTERNS = ["shopify", "e-commerce", "ecommerce", "small business", "entrepreneurship"]

    interests = []
    seen_ids = set()

    for term in search_terms:
        results = search_interests(term)
        for interest in results[:5]:
            name_lower = interest["name"].lower()
            is_allowed = any(pattern in name_lower for pattern in ALLOWED_PATTERNS)
            if is_allowed and interest["id"] not in seen_ids:
                interests.append({"id": interest["id"], "name": interest["name"]})
                seen_ids.add(interest["id"])
                print(f"  + {interest['name']}")

    return interests


def get_existing_image_hashes():
    """Get existing image hashes from the ad account."""
    result = api_call("GET", f"act_{AD_ACCOUNT_ID}/adimages", {"fields": "hash,name"})
    if result and "data" in result:
        return result["data"]
    return []


def create_sales_campaign():
    """Create a Sales campaign."""
    print("\nCreating Sales Campaign...")

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/campaigns", {
        "name": "Coupon Pulse - Sales - Conversions",
        "objective": "OUTCOME_SALES",
        "status": "PAUSED",
        "special_ad_categories": "[]",
        "is_adset_budget_sharing_enabled": "false",
    })

    if result:
        print(f"  Created: {result['id']}")
        return result["id"]
    return None


def create_conversion_adset(campaign_id, name, targeting, custom_event_type="PURCHASE"):
    """Create an ad set optimized for conversions."""
    print(f"\nCreating Ad Set: {name} (optimizing for {custom_event_type})...")

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/adsets", {
        "name": name,
        "campaign_id": campaign_id,
        "status": "PAUSED",
        "billing_event": "IMPRESSIONS",
        "optimization_goal": "OFFSITE_CONVERSIONS",
        "promoted_object": json.dumps({
            "pixel_id": PIXEL_ID,
            "custom_event_type": custom_event_type,
        }),
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
        "daily_budget": DAILY_BUDGET_CENTS,
        "targeting": json.dumps(targeting),
    })

    if result:
        print(f"  Created: {result['id']}")
        return result["id"]
    return None


def create_ad_creative(image_hash, headline, primary_text, adset_name):
    """Create an ad creative."""
    print(f"Creating creative for {adset_name}...")

    ad_name_slug = adset_name.replace(" ", "_").replace("-", "")
    utm_params = f"{UTM_BASE}&utm_adset={ad_name_slug}"
    landing_url = f"{LANDING_PAGE_URL}?{utm_params}"

    object_story_spec = {
        "page_id": PAGE_ID,
        "link_data": {
            "image_hash": image_hash,
            "link": landing_url,
            "message": primary_text,
            "name": headline,
            "description": "Start recovering lost sales today",
            "call_to_action": {
                "type": "LEARN_MORE",
                "value": {"link": landing_url}
            }
        }
    }

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/adcreatives", {
        "name": f"{headline[:30]} - {adset_name}",
        "object_story_spec": json.dumps(object_story_spec),
    })

    if result:
        print(f"  Created: {result['id']}")
        return result["id"]
    return None


def create_ad(adset_id, creative_id, name):
    """Create an ad."""
    print(f"Creating ad: {name}...")

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/ads", {
        "name": name,
        "adset_id": adset_id,
        "creative": json.dumps({"creative_id": creative_id}),
        "status": "PAUSED",
    })

    if result:
        print(f"  Created: {result['id']}")
        return result["id"]
    return None


def main():
    print("=" * 60)
    print("COUPON PULSE - SWITCH TO SALES CAMPAIGN")
    print("=" * 60)

    if not all([ACCESS_TOKEN, AD_ACCOUNT_ID, PAGE_ID]):
        print("Error: Missing FB_ACCESS_TOKEN, FB_AD_ACCOUNT_ID, or FB_PAGE_ID in .env")
        return

    print(f"\nConfig:")
    print(f"  Ad Account: act_{AD_ACCOUNT_ID}")
    print(f"  Pixel ID: {PIXEL_ID}")
    print(f"  Budget: ${DAILY_BUDGET_CENTS/100}/day per ad set")

    # Step 1: Skip pause for new account (no existing campaigns)
    print("\n" + "=" * 60)
    print("STEP 1: NEW ACCOUNT - SKIPPING PAUSE")
    print("=" * 60)
    print("  No existing campaign to pause (new ad account)")

    # Step 2: Get existing images
    print("\n" + "=" * 60)
    print("STEP 2: GET EXISTING IMAGES")
    print("=" * 60)

    images = get_existing_image_hashes()
    if not images:
        print("No images found. Upload images first using launch.py")
        return

    print(f"Found {len(images)} images")
    image_hash = images[0]["hash"]
    print(f"Using: {image_hash}")

    # Step 3: Get interests
    print("\n" + "=" * 60)
    print("STEP 3: GET TARGETING INTERESTS")
    print("=" * 60)

    interests = get_ecommerce_interests()
    if not interests:
        print("No interests found")
        return

    # Targeting config - US, CA, GB only (removed AU per marketer advice)
    # Placements: Feed + Explore only (no Story/Reels for SaaS without vertical creative)
    targeting = {
        "geo_locations": {"countries": ["US", "CA", "GB"]},
        "age_min": 25,
        "age_max": 55,
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed"],
        "instagram_positions": ["stream", "explore"],
        "targeting_automation": {"advantage_audience": 0},
        "flexible_spec": [{"interests": interests}]
    }

    # Step 4: Create Sales campaign
    print("\n" + "=" * 60)
    print("STEP 4: CREATE SALES CAMPAIGN")
    print("=" * 60)

    campaign_id = create_sales_campaign()
    if not campaign_id:
        return

    # Step 5: Create ad sets
    print("\n" + "=" * 60)
    print("STEP 5: CREATE AD SETS")
    print("=" * 60)

    # For SaaS, use Lead or CompleteRegistration (not AddToCart/Purchase)
    # Lead is best for signup-based funnels like Coupon Pulse
    adsets = [
        {"name": "Ecommerce Operators - Lead Optimization", "event": CONVERSION_EVENT},
    ]

    created_adsets = []
    for config in adsets:
        adset_id = create_conversion_adset(
            campaign_id,
            config["name"],
            targeting,
            config["event"]
        )
        if adset_id:
            created_adsets.append({"id": adset_id, "name": config["name"]})

    # Step 6: Create ads (using winning "Wasted Traffic" creative)
    print("\n" + "=" * 60)
    print("STEP 6: CREATE ADS")
    print("=" * 60)

    headline = "You Paid for the Click. Don't Waste It."
    primary_text = """Shopify traffic is expensive.

Coupon Pulse gives hesitant visitors one final reason to buy before they leave your store.

Use smart coupon nudges triggered by behavior — not random popups."""

    for adset in created_adsets:
        creative_id = create_ad_creative(image_hash, headline, primary_text, adset["name"])
        if creative_id:
            create_ad(adset["id"], creative_id, f"Wasted Traffic - {adset['name']}")

    # Summary
    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"""
Created:
  - Sales campaign: {campaign_id}
  - 1 Ad Set optimizing for Lead events (best for SaaS)
  - Countries: US, CA, GB only
  - Interests: Shopify, E-commerce, Small business (no Dropshipping)
  - Placements: Feed + Explore (no Story/Reels)
  - Ads with "Wasted Traffic" creative (your winner)

All ads are PAUSED. Next steps:
  1. Go to Ads Manager
  2. Review the new "Coupon Pulse - Sales - Conversions" campaign
  3. Turn on the campaign when ready
  4. Once you hit 50+ AddToCart/week, switch to Purchase optimization

Ads Manager: https://business.facebook.com/adsmanager/manage/campaigns?act={AD_ACCOUNT_ID}
""")


if __name__ == "__main__":
    main()
