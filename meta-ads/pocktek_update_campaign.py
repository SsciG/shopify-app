"""
PockTek Campaign Update Script
- Consolidate to 1 ad set
- Set budget to $10/day
- Pause Sunset Lamp (too expensive at €225)
- Pause Wireless Charger (no clicks)
- Keep RGB Panels + Floating Light
- Add 65W GaN Charger (€9.99 entry product)
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

ACCESS_TOKEN = os.getenv('FB_ACCESS_TOKEN')
AD_ACCOUNT_ID = os.getenv('FB_AD_ACCOUNT_ID')
PIXEL_ID = os.getenv('POCKTEK_PIXEL_ID') or "1673889453834052"

API_VERSION = 'v25.0'
BASE_URL = f'https://graph.facebook.com/{API_VERSION}'

SITE_URL = "https://pocktek.myshopify.com"
IMAGE_DIR = os.path.join(os.path.dirname(__file__), "pocktek_images")


def api_get(endpoint, params=None):
    """GET request to Meta API."""
    url = f"{BASE_URL}/{endpoint}"
    params = params or {}
    params["access_token"] = ACCESS_TOKEN
    response = requests.get(url, params=params)
    return response.json()


def api_post(endpoint, data):
    """POST request to Meta API."""
    url = f"{BASE_URL}/{endpoint}"
    data["access_token"] = ACCESS_TOKEN
    response = requests.post(url, data=data)
    return response.json()


def get_pocktek_campaigns():
    """Get all PockTek campaigns."""
    result = api_get(f"act_{AD_ACCOUNT_ID}/campaigns", {
        "fields": "id,name,status,daily_budget",
        "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": "Pocktek"}])
    })
    return result.get("data", [])


def get_adsets(campaign_id):
    """Get ad sets for a campaign."""
    result = api_get(f"{campaign_id}/adsets", {
        "fields": "id,name,status,daily_budget"
    })
    return result.get("data", [])


def get_ads(adset_id):
    """Get ads for an ad set."""
    result = api_get(f"{adset_id}/ads", {
        "fields": "id,name,status"
    })
    return result.get("data", [])


def update_adset_budget(adset_id, daily_budget_cents):
    """Update ad set daily budget."""
    result = api_post(adset_id, {"daily_budget": daily_budget_cents})
    if "error" in result:
        print(f"  Error: {result['error']['message']}")
        return False
    return True


def pause_ad(ad_id, ad_name):
    """Pause an ad."""
    print(f"  Pausing: {ad_name}")
    result = api_post(ad_id, {"status": "PAUSED"})
    if "error" in result:
        print(f"    Error: {result['error']['message']}")
        return False
    return True


def pause_adset(adset_id, adset_name):
    """Pause an ad set."""
    print(f"  Pausing ad set: {adset_name}")
    result = api_post(adset_id, {"status": "PAUSED"})
    if "error" in result:
        print(f"    Error: {result['error']['message']}")
        return False
    return True


def get_available_pages():
    """Get pages available to use with this ad account."""
    result = api_get("me/accounts", {"fields": "id,name"})
    if "data" in result:
        for page in result["data"]:
            if "pocktek" in page["name"].lower():
                return page["id"]
    return None


def upload_image(image_path):
    """Upload an image and return the hash."""
    if not os.path.exists(image_path):
        print(f"  Image not found: {image_path}")
        return None

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adimages"
    with open(image_path, 'rb') as f:
        files = {'filename': f}
        params = {'access_token': ACCESS_TOKEN}
        response = requests.post(url, params=params, files=files)

    data = response.json()
    if "error" in data:
        print(f"  Error uploading: {data['error']['message']}")
        return None

    for key, value in data.get('images', {}).items():
        return value.get('hash')
    return None


def create_ad(adset_id, page_id, image_hash, ad_config):
    """Create a new ad."""
    print(f"  Creating ad: {ad_config['name']}")

    # Create creative
    object_story_spec = {
        "page_id": page_id,
        "link_data": {
            "link": ad_config["link"],
            "message": ad_config["primary_text"],
            "name": ad_config["headline"],
            "description": ad_config["description"],
            "image_hash": image_hash,
            "call_to_action": {
                "type": "SHOP_NOW",
                "value": {"link": ad_config["link"]}
            }
        }
    }

    creative_result = api_post(f"act_{AD_ACCOUNT_ID}/adcreatives", {
        "name": ad_config["name"],
        "object_story_spec": json.dumps(object_story_spec),
    })

    if "error" in creative_result:
        print(f"    Creative error: {creative_result['error']['message']}")
        return False

    creative_id = creative_result["id"]

    # Create ad
    ad_result = api_post(f"act_{AD_ACCOUNT_ID}/ads", {
        "name": ad_config["name"],
        "adset_id": adset_id,
        "creative": json.dumps({"creative_id": creative_id}),
        "status": "ACTIVE",
    })

    if "error" in ad_result:
        print(f"    Ad error: {ad_result['error']['message']}")
        return False

    print(f"    Created: {ad_result['id']}")
    return True


def main():
    print("=" * 60)
    print("POCKTEK CAMPAIGN UPDATE")
    print("=" * 60)
    print("""
Changes:
  - Consolidate to 1 ad set (pause Broad, keep Tech)
  - Set budget to $10/day
  - Pause: Sunset Lamp (€225 too expensive), Wireless Charger (no clicks)
  - Keep: RGB Panels, Floating Light
  - Add: 65W GaN Charger (€9.99 entry product)
""")

    # Get campaigns
    print("\n1. Finding PockTek campaigns...")
    campaigns = get_pocktek_campaigns()

    if not campaigns:
        print("   No PockTek campaigns found!")
        return

    for campaign in campaigns:
        print(f"   Found: {campaign['name']} ({campaign['status']})")

    # Use the active campaign
    active_campaign = None
    for c in campaigns:
        if c['status'] == 'ACTIVE':
            active_campaign = c
            break

    if not active_campaign:
        active_campaign = campaigns[0]

    campaign_id = active_campaign['id']
    print(f"\n   Using: {active_campaign['name']}")

    # Get ad sets
    print("\n2. Getting ad sets...")
    adsets = get_adsets(campaign_id)

    tech_adset = None
    broad_adset = None

    for adset in adsets:
        print(f"   Found: {adset['name']} ({adset['status']})")
        if "tech" in adset['name'].lower():
            tech_adset = adset
        elif "broad" in adset['name'].lower():
            broad_adset = adset

    # Pause Broad ad set (consolidate to Tech only)
    print("\n3. Consolidating to 1 ad set...")
    if broad_adset:
        pause_adset(broad_adset['id'], broad_adset['name'])

    if not tech_adset:
        print("   ERROR: No Tech ad set found!")
        return

    # Update Tech ad set budget to $10/day
    print("\n4. Setting budget to $10/day...")
    if update_adset_budget(tech_adset['id'], 1000):
        print(f"   Updated {tech_adset['name']} to $10/day")

    # Get ads in Tech ad set
    print("\n5. Managing ads...")
    ads = get_ads(tech_adset['id'])

    for ad in ads:
        ad_name = ad['name'].lower()

        # Pause Sunset Lamp (€225 too expensive)
        if "sunset" in ad_name:
            pause_ad(ad['id'], ad['name'])

        # Pause Wireless Charger (no clicks)
        elif "wireless charger" in ad_name or "charger" in ad_name and "gan" not in ad_name:
            pause_ad(ad['id'], ad['name'])

        # Keep RGB Panels and Floating Light
        elif "rgb" in ad_name or "floating" in ad_name or "panel" in ad_name:
            print(f"  Keeping: {ad['name']}")

    # Add 65W GaN Charger ad
    print("\n6. Adding 65W GaN Charger ad...")

    page_id = get_available_pages()
    if not page_id:
        print("   ERROR: No PockTek page found!")
        return

    # Check if image exists, if not skip
    charger_image = os.path.join(IMAGE_DIR, "65w-flat-gan-usb-c-charger-dual-port-fast-wall-charger-compact-power-adapter-with-foldable-plug-for-mobile-phone.png")

    if os.path.exists(charger_image):
        image_hash = upload_image(charger_image)

        if image_hash:
            charger_ad = {
                "name": "Ad - 65W GaN Charger",
                "primary_text": "Finally, a charger that actually fits in your pocket.\n\n65W fast charging. 3 ports. Foldable plug. Works with iPhone, Android, laptops, and tablets.\n\nNo more carrying multiple chargers.",
                "headline": "65W GaN Charger — €9.99",
                "description": "Free Shipping Available",
                "link": f"{SITE_URL}/collections/all",
            }

            create_ad(tech_adset['id'], page_id, image_hash, charger_ad)
    else:
        print(f"   Image not found: {charger_image}")
        print("   Skipping GaN Charger ad (add image and re-run if needed)")

    # Summary
    print("\n" + "=" * 60)
    print("UPDATE COMPLETE")
    print("=" * 60)
    print("""
Changes made:
  ✓ Paused Broad ad set (consolidated to Tech only)
  ✓ Set budget to $10/day
  ✓ Paused Sunset Lamp ads (€225 too expensive)
  ✓ Paused Wireless Charger ads (no clicks)
  ✓ Kept RGB Panels + Floating Light
  ✓ Added 65W GaN Charger (€9.99 entry product)

Current structure:
  - 1 Campaign: Pocktek - Sales
  - 1 Ad Set: Tech Enthusiasts ($10/day)
  - 3 Ads: RGB Panels, Floating Light, GaN Charger
  - Optimization: Purchase

IMPORTANT: Fix the pixel tracking first!
The pixel is not receiving events from Shopify.
Go to Shopify > Facebook & Instagram > Complete setup.
""")


if __name__ == "__main__":
    main()
