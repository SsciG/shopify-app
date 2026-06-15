"""
Meta Ads Campaign Launcher for Coupon Pulse
Creates a Traffic campaign with 2 ad sets and 3 ads each (6 total), all PAUSED.

Usage:
    python launch.py

Before running:
1. Add your ad creative images to the 'images/' folder (ad1.png, ad2.png, ad3.png)
2. Ensure .env has FB_ACCESS_TOKEN, FB_AD_ACCOUNT_ID, FB_PAGE_ID
"""

import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from parent .env
load_dotenv(Path(__file__).parent.parent / ".env")

# Configuration
ACCESS_TOKEN = os.getenv("FB_ACCESS_TOKEN")
AD_ACCOUNT_ID = os.getenv("FB_AD_ACCOUNT_ID")
PAGE_ID = os.getenv("COUPON_PULSE_PAGE_ID") or os.getenv("FB_PAGE_ID")


def get_available_pages():
    """Get pages available to use with this ad account."""
    # First try to get pages from the user's accounts
    url = f"{BASE_URL}/me/accounts"
    params = {"access_token": ACCESS_TOKEN, "fields": "id,name,access_token"}
    response = requests.get(url, params=params)
    result = response.json()

    if "data" in result and result["data"]:
        print("Available pages:")
        for page in result["data"]:
            print(f"  - {page['name']} (ID: {page['id']})")
        return result["data"]

    print("No pages found via /me/accounts")
    return []


def get_page_access_token(page_id):
    """Get page access token for a specific page."""
    url = f"{BASE_URL}/me/accounts"
    params = {"access_token": ACCESS_TOKEN, "fields": "id,name,access_token"}
    response = requests.get(url, params=params)
    result = response.json()

    if "data" in result:
        for page in result["data"]:
            if page["id"] == str(page_id):
                return page.get("access_token")
    return None

# Strip 'act_' prefix if accidentally included in env var
if AD_ACCOUNT_ID and AD_ACCOUNT_ID.startswith("act_"):
    AD_ACCOUNT_ID = AD_ACCOUNT_ID[4:]
PIXEL_ID = "2786506521715348"  # Coupon Pulse Pixel
API_VERSION = "v25.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# Campaign settings
LANDING_PAGE_URL = "https://couponpulse.co/"
# Base UTM params - ad/adset names added dynamically
UTM_BASE = "utm_source=meta&utm_medium=paid&utm_campaign=validation"
DAILY_BUDGET_CENTS = 700  # $7/day per ad set = ~$100/week total

# Ad creative definitions - each tests a different pain point
AD_CREATIVES = [
    {
        "name": "Ad 1 - Exit Intent",
        "image": "images/ad1.png",
        "headline": "Recover Visitors Before They Leave",
        "primary_text": "Most Shopify visitors leave without buying.\n\nCoupon Pulse detects exit intent and hesitation, then shows a smart time-sensitive coupon before the shopper disappears.\n\nNo coding. Built for Shopify stores.",
        "link_description": "See How It Works",
        "cta": "LEARN_MORE",
    },
    {
        "name": "Ad 2 - Wasted Traffic",
        "image": "images/ad2.png",
        "headline": "You Paid for the Click. Don't Waste It.",
        "primary_text": "Shopify traffic is expensive.\n\nCoupon Pulse gives hesitant visitors one final reason to buy before they leave your store.\n\nUse smart coupon nudges triggered by behavior — not random popups.",
        "link_description": "Install on Shopify",
        "cta": "LEARN_MORE",
    },
    {
        "name": "Ad 3 - Discount Control",
        "image": "images/ad3.png",
        "headline": "Stop Giving Coupons to Everyone",
        "primary_text": "Most coupon popups discount shoppers who may have bought anyway.\n\nCoupon Pulse shows offers only when shoppers show hesitation, exit intent, or abandonment risk.\n\nRecover sales without training every customer to wait for a discount.",
        "link_description": "Start With Coupon Pulse",
        "cta": "LEARN_MORE",
    },
]

# Targeting - English-speaking ecommerce markets
BASE_TARGETING = {
    "geo_locations": {
        "countries": ["US", "CA", "GB", "NZ"],
    },
    "age_min": 25,
    "age_max": 55,
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed"],
    "instagram_positions": ["stream", "explore"],
    "targeting_automation": {
        "advantage_audience": 0,  # Disable Advantage+ audience to use our targeting
    },
}

# Ad Set 1: Ecommerce/Shopify operators - targeted hypothesis
# Interest IDs will be fetched dynamically via search_interests()
TARGETING_ECOMMERCE = {
    **BASE_TARGETING,
    # flexible_spec will be added after fetching valid interest IDs
}

# Ad Set 2: Broad validation - let Meta find the audience
TARGETING_BROAD = {
    **BASE_TARGETING,
}


def api_call(method, endpoint, data=None, files=None):
    """Make an API call to Meta Graph API."""
    url = f"{BASE_URL}/{endpoint}"
    params = {"access_token": ACCESS_TOKEN}

    if method == "GET":
        response = requests.get(url, params={**params, **(data or {})})
    elif method == "POST":
        if files:
            response = requests.post(url, params=params, data=data, files=files)
        else:
            response = requests.post(url, params=params, data=data)

    result = response.json()

    if "error" in result:
        print(f"API Error: {result['error']['message']}")
        print(f"Error Code: {result['error'].get('code')}")
        print(f"Error Subcode: {result['error'].get('error_subcode')}")
        print(f"Error Type: {result['error'].get('type')}")
        print(f"Full Error: {json.dumps(result['error'], indent=2)}")
        print(f"Endpoint: {endpoint}")
        print(f"Data: {json.dumps(data, indent=2)}")
        return None

    return result


def search_interests(query):
    """Search for valid interest targeting IDs via Meta API."""
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
    print("\nSearching for ecommerce interest targeting...")

    # Keywords to search for ecommerce operators (not consumers)
    search_terms = [
        "Shopify",
        "E-commerce",
        "Small business",
        "Digital marketing",
        "Online advertising",
        "Dropshipping",
    ]

    # Only allow interests that match these patterns (case-insensitive)
    # This filters out consumer interests like "Online shopping"
    ALLOWED_PATTERNS = [
        "shopify",
        "e-commerce",
        "ecommerce",
        "digital marketing",
        "online advertising",
        "small business",
        "dropshipping",
        "woocommerce",
        "bigcommerce",
        "magento",
        "entrepreneurship",
        "online business",
    ]

    interests = []
    seen_ids = set()

    for term in search_terms:
        results = search_interests(term)
        for interest in results[:5]:  # Check top 5, but filter strictly
            name_lower = interest["name"].lower()
            # Only include if name matches allowed patterns
            is_allowed = any(pattern in name_lower for pattern in ALLOWED_PATTERNS)
            if is_allowed and interest["id"] not in seen_ids:
                interests.append({
                    "id": interest["id"],
                    "name": interest["name"],
                })
                seen_ids.add(interest["id"])
                print(f"   Found: {interest['name']} (ID: {interest['id']})")

    return interests


def upload_image(image_path):
    """Upload an image to the ad account and return the image hash."""
    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        return None

    with open(image_path, "rb") as f:
        result = api_call(
            "POST",
            f"act_{AD_ACCOUNT_ID}/adimages",
            files={"filename": f}
        )

    if result and "images" in result:
        # Get the hash from the response
        image_data = list(result["images"].values())[0]
        print(f"Uploaded image: {image_path} -> {image_data['hash']}")
        return image_data["hash"]

    return None


def create_campaign():
    """Create a Traffic campaign in PAUSED status."""
    print("\n1. Creating Campaign...")

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/campaigns", {
        "name": "Coupon Pulse - Traffic - Validation",
        "objective": "OUTCOME_TRAFFIC",
        "status": "PAUSED",
        "special_ad_categories": "[]",
        "is_adset_budget_sharing_enabled": "false",  # Required: ad sets manage their own budgets
    })

    if result:
        campaign_id = result["id"]
        print(f"   Campaign created: {campaign_id}")
        return campaign_id

    return None


def create_ad_set(campaign_id, name, targeting):
    """Create an ad set with daily budget and Landing Page Views optimization."""
    print(f"\n2. Creating Ad Set: {name}...")

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/adsets", {
        "name": name,
        "campaign_id": campaign_id,
        "status": "PAUSED",
        "billing_event": "IMPRESSIONS",
        "optimization_goal": "LINK_CLICKS",  # Simpler than LANDING_PAGE_VIEWS
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
        "daily_budget": DAILY_BUDGET_CENTS,
        "targeting": json.dumps(targeting),
    })

    if result:
        adset_id = result["id"]
        print(f"   Ad Set created: {adset_id}")
        return adset_id

    return None


def create_ad_creative(image_hash, creative_config, adset_name, page_id):
    """Create an ad creative using the uploaded image with dynamic UTM tracking."""
    print(f"\n3. Creating Ad Creative: {creative_config['name']} for {adset_name}...")
    print(f"   Using Page ID: {page_id}")

    # Build URL with dynamic UTM parameters for tracking
    ad_name_slug = creative_config["name"].replace(" ", "_").replace("-", "")
    adset_slug = adset_name.replace(" ", "_").replace("-", "")
    utm_params = f"{UTM_BASE}&utm_adset={adset_slug}&utm_ad={ad_name_slug}&utm_content={ad_name_slug}"
    landing_url = f"{LANDING_PAGE_URL}?{utm_params}"

    object_story_spec = {
        "page_id": page_id,
        "link_data": {
            "image_hash": image_hash,
            "link": landing_url,
            "message": creative_config["primary_text"],
            "name": creative_config["headline"],
            "description": creative_config["link_description"],
            "call_to_action": {
                "type": creative_config["cta"],
                "value": {"link": landing_url}
            }
        }
    }

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/adcreatives", {
        "name": f"{creative_config['name']} - {adset_name}",
        "object_story_spec": json.dumps(object_story_spec),
    })

    if result:
        creative_id = result["id"]
        print(f"   Creative created: {creative_id}")
        return creative_id

    return None


def create_ad(adset_id, creative_id, name):
    """Create an ad linking the creative to the ad set."""
    print(f"\n4. Creating Ad: {name}...")

    result = api_call("POST", f"act_{AD_ACCOUNT_ID}/ads", {
        "name": name,
        "adset_id": adset_id,
        "creative": json.dumps({"creative_id": creative_id}),
        "status": "PAUSED",
    })

    if result:
        ad_id = result["id"]
        print(f"   Ad created: {ad_id}")
        return ad_id

    return None


def main():
    print("=" * 60)
    print("Coupon Pulse - Meta Ads Campaign Launcher")
    print("=" * 60)

    # Validate config
    if not all([ACCESS_TOKEN, AD_ACCOUNT_ID, PAGE_ID]):
        print("Error: Missing environment variables. Check .env file.")
        print(f"  ACCESS_TOKEN: {'set' if ACCESS_TOKEN else 'MISSING'}")
        print(f"  AD_ACCOUNT_ID: {'set' if AD_ACCOUNT_ID else 'MISSING'}")
        print(f"  PAGE_ID: {'set' if PAGE_ID else 'MISSING'}")
        return

    print(f"\nConfig:")
    print(f"  Ad Account: act_{AD_ACCOUNT_ID}")
    print(f"  Page ID: {PAGE_ID}")
    print(f"  Pixel ID: {PIXEL_ID}")
    print(f"  Landing Page: {LANDING_PAGE_URL}")
    print(f"  UTM Base: {UTM_BASE}")
    print(f"  Daily Budget: ${DAILY_BUDGET_CENTS/100}/ad set (~$100/week total)")

    # Check available pages
    print("\n" + "=" * 60)
    print("Checking Available Pages...")
    print("=" * 60)
    available_pages = get_available_pages()

    # Find the correct page ID from available pages
    page_to_use = PAGE_ID
    for page in available_pages:
        if "coupon" in page["name"].lower() or "pulse" in page["name"].lower():
            page_to_use = page["id"]
            print(f"\nUsing page: {page['name']} (ID: {page_to_use})")
            break

    if not available_pages:
        print("\nWARNING: No pages found. The access token may need pages_read_engagement permission.")
        print(f"Will try with configured PAGE_ID: {PAGE_ID}")

    # Check for images
    images_dir = Path(__file__).parent / "images"
    images_dir.mkdir(exist_ok=True)

    missing_images = []
    for creative in AD_CREATIVES:
        img_path = Path(__file__).parent / creative["image"]
        if not img_path.exists():
            missing_images.append(creative["image"])

    if missing_images:
        print(f"\n⚠️  Missing images - add these before running:")
        for img in missing_images:
            print(f"   - {img}")
        print(f"\nCreate the images folder and add your ad images:")
        print(f"   mkdir {images_dir}")
        print(f"   # Add ad1.png, ad2.png, ad3.png")
        return

    # Step 0: Fetch ecommerce interest targeting
    print("\n" + "=" * 60)
    print("Fetching Interest Targeting...")
    print("=" * 60)

    ecommerce_interests = get_ecommerce_interests()
    if ecommerce_interests:
        # Update TARGETING_ECOMMERCE with found interests
        TARGETING_ECOMMERCE["flexible_spec"] = [{
            "interests": ecommerce_interests
        }]
        print(f"\n   Added {len(ecommerce_interests)} interests to Ad Set 1 targeting")
    else:
        print("Error: No ecommerce interests found. Stop and check targeting search.")
        return

    # Step 1: Upload images
    print("\n" + "=" * 60)
    print("Uploading Images...")
    print("=" * 60)

    image_hashes = {}
    for creative in AD_CREATIVES:
        img_path = Path(__file__).parent / creative["image"]
        hash_val = upload_image(str(img_path))
        if hash_val:
            image_hashes[creative["name"]] = hash_val
        else:
            print(f"Failed to upload {creative['image']}")
            return

    # Step 2: Create campaign
    print("\n" + "=" * 60)
    print("Creating Campaign Structure...")
    print("=" * 60)

    campaign_id = create_campaign()
    if not campaign_id:
        print("Failed to create campaign")
        return

    # Step 3: Create ad sets - one targeted, one broad
    ad_sets = [
        {"name": "AdSet 1 - Ecommerce Operators", "targeting": TARGETING_ECOMMERCE},
        {"name": "AdSet 2 - Broad Validation", "targeting": TARGETING_BROAD},
    ]

    created_adsets = []
    for adset_config in ad_sets:
        adset_id = create_ad_set(campaign_id, adset_config["name"], adset_config["targeting"])
        if adset_id:
            created_adsets.append(adset_id)
        else:
            print(f"Failed to create ad set: {adset_config['name']}")
            return

    # Step 4 & 5: Create ad creatives and ads (unique creative per adset for UTM tracking)
    print("\n" + "=" * 60)
    print("Creating Ad Creatives and Ads...")
    print("=" * 60)

    created_ads = []
    for adset_id, adset_config in zip(created_adsets, ad_sets):
        adset_name = adset_config["name"]
        print(f"\n--- {adset_name} ---")

        for creative in AD_CREATIVES:
            image_hash = image_hashes[creative["name"]]
            # Create unique creative per adset (for unique UTM tracking)
            creative_id = create_ad_creative(image_hash, creative, adset_name, page_to_use)
            if not creative_id:
                print(f"Failed to create creative: {creative['name']}")
                continue

            # Create ad linking creative to adset
            ad_name = f"{creative['name']} - {adset_name}"
            ad_id = create_ad(adset_id, creative_id, ad_name)
            if ad_id:
                created_ads.append(ad_id)
            else:
                print(f"Failed to create ad: {ad_name}")

    # Summary
    print("\n" + "=" * 60)
    print("CAMPAIGN CREATED SUCCESSFULLY!")
    print("=" * 60)
    print(f"\nCampaign ID: {campaign_id}")
    print(f"Ad Sets: {len(created_adsets)}")
    print(f"Ads: {len(created_ads)}")
    print(f"\nAll ads are PAUSED. To activate:")
    print(f"1. Go to Meta Ads Manager")
    print(f"2. Review the campaign and ads")
    print(f"3. Add a payment method if not done")
    print(f"4. Turn on the campaign when ready")
    print(f"\nAds Manager: https://business.facebook.com/adsmanager/manage/campaigns?act={AD_ACCOUNT_ID}")


if __name__ == "__main__":
    main()
