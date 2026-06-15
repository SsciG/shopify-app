"""
Pocktek - Meta Ads Campaign Launch Script
Tech accessories store - Sales campaign (optimized for Purchase)
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

ACCESS_TOKEN = os.getenv('FB_ACCESS_TOKEN')
AD_ACCOUNT_ID = os.getenv('FB_AD_ACCOUNT_ID')
PAGE_ID = os.getenv('POCKTEK_PAGE_ID') or os.getenv('FB_PAGE_ID')

API_VERSION = 'v25.0'
BASE_URL = f'https://graph.facebook.com/{API_VERSION}'


def get_available_pages():
    """Get pages available to use with this ad account."""
    url = f"{BASE_URL}/me/accounts"
    params = {"access_token": ACCESS_TOKEN, "fields": "id,name"}
    response = requests.get(url, params=params)
    result = response.json()

    if "data" in result and result["data"]:
        print("Available pages:")
        for page in result["data"]:
            print(f"  - {page['name']} (ID: {page['id']})")
        return result["data"]
    return []


def get_available_pixels():
    """Get pixels available to this ad account."""
    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adspixels"
    params = {"access_token": ACCESS_TOKEN, "fields": "id,name"}
    response = requests.get(url, params=params)
    result = response.json()

    if "data" in result and result["data"]:
        print("\nAvailable pixels:")
        for pixel in result["data"]:
            print(f"  - {pixel.get('name', 'Unnamed')} (ID: {pixel['id']})")
        return result["data"]
    print("\nNo pixels found for this ad account.")
    return []


# Campaign config
CAMPAIGN_NAME = "Pocktek - Sales - Targeted"
DAILY_BUDGET = 5000  # $50/day total ($25 per ad set)
SITE_URL = "https://pocktek.myshopify.com"
PIXEL_ID = os.getenv('POCKTEK_PIXEL_ID') or "1673889453834052"

# Conversion event: Purchase (or ADD_TO_CART if no purchase data yet)
CONVERSION_EVENT = "PURCHASE"

# Image directory
IMAGE_DIR = os.path.join(os.path.dirname(__file__), "pocktek_images")

# 4-product strategy: High visual appeal + conversion potential
ADS = [
    {
        "name": "Ad 1 - Sunset Lamp",
        "primary_text": "Turn any room into a vibe.\n\nThis sunset lamp projector creates the perfect ambient glow for photos, relaxation, or just making your space look incredible.\n\nNo filter needed.",
        "headline": "The Viral Sunset Lamp",
        "description": "Free Shipping Available",
        "link": f"{SITE_URL}/collections/all",
        "image_file": "sunset-lamp-projector.png",
    },
    {
        "name": "Ad 2 - RGB Panels",
        "primary_text": "Level up your setup.\n\nThese modular RGB hex panels let you create your own custom wall art that lights up. Perfect for gaming rooms, streaming, or just flexing your space.\n\nEasy install. No tools needed.",
        "headline": "Hexaglow RGB Wall Panels",
        "description": "Create Your Setup",
        "link": f"{SITE_URL}/collections/all",
        "image_file": "hexaglow-rgb-panels.png",
    },
    {
        "name": "Ad 3 - Wireless Charger",
        "primary_text": "One dock. All your devices.\n\nCharge your iPhone, AirPods, and Apple Watch from one compact station. Foldable for travel. Clean desk, finally.\n\nWorks with iPhone 12-16 & Android.",
        "headline": "3-in-1 Wireless Charging Station",
        "description": "Declutter Your Desk",
        "link": f"{SITE_URL}/collections/all",
        "image_file": "3-in-1-magnetic-wireless-charging-station-for-iphone-12-16-pro-max-airpods-foldable-travel-dock-fast-charging-pad-compatible-for-apple-watch-android-phones.png",
    },
    {
        "name": "Ad 4 - Floating Light",
        "primary_text": "Wait... is that floating?\n\nThis anti-gravity lamp levitates while wirelessly charging your phone. Doubles as a dimmable desk lamp and the ultimate conversation starter.\n\nYes, it actually floats.",
        "headline": "Levitating Night Light + Charger",
        "description": "The Coolest Lamp You'll Own",
        "link": f"{SITE_URL}/collections/all",
        "image_file": "led-suspending-anti-gravity-night-light-with-10w-wireless-charger-desk-lamp-dimmable-table-light-for-bedroom-bedside-decor-light.png",
    },
]

# Targeting - Reduced country list per marketer advice
# Removed: FR, IT, ES, BE, AT, CH, NZ, AE, AU (EU complexity + low conversion)
TARGETING = {
    "age_min": 21,
    "age_max": 55,
    "genders": [1, 2],
    "geo_locations": {
        "location_types": ["home", "recent"],
        "countries": ["US", "CA", "GB", "DE", "NL", "SE", "DK", "IE"]
    },
    "flexible_spec": [
        {
            "interests": [
                {"id": "6003139266461", "name": "Technology"},
                {"id": "6003384248805", "name": "Consumer electronics"},
                {"id": "6003277229371", "name": "Gadgets"},
                {"id": "6003107902433", "name": "Smartphones"},
                {"id": "6003020834693", "name": "Online shopping"},
            ]
        }
    ],
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed"],
    "instagram_positions": ["stream", "story", "reels"],
    "targeting_automation": {"advantage_audience": 0},
}

# Broad targeting with Advantage+ (let Meta find the audience)
# Note: Advantage+ requires age_max >= 65
TARGETING_BROAD = {
    "age_min": 21,
    "age_max": 65,
    "genders": [1, 2],
    "geo_locations": {
        "location_types": ["home", "recent"],
        "countries": ["US", "CA", "GB", "DE", "NL", "SE", "DK", "IE"]
    },
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed"],
    "instagram_positions": ["stream", "story", "reels"],
    "targeting_automation": {"advantage_audience": 1},
}


def upload_image(image_path):
    """Upload an image to the ad account and return the hash."""
    print(f"Uploading image: {os.path.basename(image_path)}...")

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adimages"

    with open(image_path, 'rb') as f:
        files = {'filename': f}
        params = {'access_token': ACCESS_TOKEN}
        response = requests.post(url, params=params, files=files)

    data = response.json()

    if "error" in data:
        print(f"Error uploading image: {data['error']}")
        return None

    # Get the image hash from the response
    images = data.get('images', {})
    for key, value in images.items():
        image_hash = value.get('hash')
        print(f"Image uploaded: {image_hash}")
        return image_hash

    return None


def create_campaign():
    """Create the Sales campaign."""
    print("\nCreating Sales campaign...")

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/campaigns"
    params = {
        "access_token": ACCESS_TOKEN,
        "name": CAMPAIGN_NAME,
        "objective": "OUTCOME_SALES",
        "status": "PAUSED",
        "special_ad_categories": "[]",
        "is_adset_budget_sharing_enabled": "false",
    }

    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error creating campaign: {data['error']}")
        return None

    campaign_id = data["id"]
    print(f"Campaign created: {campaign_id}")
    return campaign_id


def create_adset(campaign_id, name, targeting, daily_budget):
    """Create an ad set optimized for conversions."""
    print(f"\nCreating ad set: {name}...")

    import json

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adsets"
    params = {
        "access_token": ACCESS_TOKEN,
        "campaign_id": campaign_id,
        "name": name,
        "optimization_goal": "OFFSITE_CONVERSIONS",
        "billing_event": "IMPRESSIONS",
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
        "daily_budget": daily_budget,
        "targeting": json.dumps(targeting),
        "promoted_object": json.dumps({
            "pixel_id": PIXEL_ID,
            "custom_event_type": CONVERSION_EVENT,
        }),
        "status": "PAUSED",
    }

    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error creating ad set: {data['error']}")
        return None

    adset_id = data["id"]
    print(f"Ad set created: {adset_id}")
    return adset_id


def create_ad_creative(ad_config, image_hash, page_id):
    """Create an ad creative with image."""
    print(f"Creating creative: {ad_config['name']}...")
    print(f"  Using Page ID: {page_id}")

    import json

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

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adcreatives"
    params = {
        "access_token": ACCESS_TOKEN,
        "name": ad_config["name"],
        "object_story_spec": json.dumps(object_story_spec),
    }

    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error creating creative: {data['error']}")
        return None

    creative_id = data["id"]
    print(f"Creative created: {creative_id}")
    return creative_id


def create_ad(adset_id, creative_id, name):
    """Create an ad."""
    print(f"Creating ad: {name}...")

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/ads"
    params = {
        "access_token": ACCESS_TOKEN,
        "adset_id": adset_id,
        "creative": f'{{"creative_id": "{creative_id}"}}',
        "name": name,
        "status": "PAUSED",
    }

    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error creating ad: {data['error']}")
        return None

    ad_id = data["id"]
    print(f"Ad created: {ad_id}")
    return ad_id


def main():
    print("=" * 60)
    print("POCKTEK - META ADS CAMPAIGN LAUNCH")
    print("=" * 60)
    print(f"\nSite: {SITE_URL}")
    print(f"Budget: ${DAILY_BUDGET/100:.2f}/day (~$100/week)")
    print(f"Targeting: 8 countries (US, CA, GB, DE, NL, SE, DK, IE)")

    # Check available pages
    print("\n" + "=" * 60)
    print("Checking Available Pages...")
    print("=" * 60)
    available_pages = get_available_pages()

    page_to_use = PAGE_ID
    for page in available_pages:
        if "pocktek" in page["name"].lower():
            page_to_use = page["id"]
            print(f"\nUsing page: {page['name']} (ID: {page_to_use})")
            break

    if not available_pages:
        print(f"\nWARNING: No pages found. Using configured PAGE_ID: {PAGE_ID}")

    # Check available pixels
    available_pixels = get_available_pixels()
    print(f"\nUsing configured pixel: {PIXEL_ID}")

    # Upload images first
    print("\n" + "=" * 60)
    print("UPLOADING IMAGES")
    print("=" * 60)

    image_hashes = {}
    for ad in ADS:
        image_path = os.path.join(IMAGE_DIR, ad["image_file"])
        if os.path.exists(image_path):
            image_hash = upload_image(image_path)
            if image_hash:
                image_hashes[ad["image_file"]] = image_hash
        else:
            print(f"Image not found: {image_path}")

    if not image_hashes:
        print("No images uploaded. Cannot continue.")
        return

    # Create campaign
    print("\n" + "=" * 60)
    print("CREATING CAMPAIGN")
    print("=" * 60)

    campaign_id = create_campaign()
    if not campaign_id:
        return

    # Create ad sets - split budget between two
    adset1_id = create_adset(
        campaign_id,
        "Pocktek - Tech Enthusiasts",
        TARGETING,
        DAILY_BUDGET // 2
    )

    adset2_id = create_adset(
        campaign_id,
        "Pocktek - Broad Audience",
        TARGETING_BROAD,
        DAILY_BUDGET // 2
    )

    if not adset1_id or not adset2_id:
        print("Failed to create ad sets. Stopping.")
        return

    # Create ads
    print("\n" + "=" * 60)
    print("CREATING ADS")
    print("=" * 60)

    for ad_config in ADS:
        image_hash = image_hashes.get(ad_config["image_file"])
        if not image_hash:
            print(f"Skipping ad (no image): {ad_config['name']}")
            continue

        creative_id = create_ad_creative(ad_config, image_hash, page_to_use)
        if creative_id:
            create_ad(adset1_id, creative_id, f"{ad_config['name']} - Tech")
            create_ad(adset2_id, creative_id, f"{ad_config['name']} - Broad")

    print("\n" + "=" * 60)
    print("SALES CAMPAIGN CREATED (PAUSED)")
    print("=" * 60)
    print(f"\nCampaign ID: {campaign_id}")
    print(f"Ad Set 1 (Tech Interests): {adset1_id}")
    print(f"Ad Set 2 (Broad/Advantage+): {adset2_id}")
    print(f"\nAds created: {len(ADS) * 2} (4 creatives x 2 ad sets)")
    print(f"\nSettings applied (per marketer advice):")
    print(f"  - Objective: Sales (optimized for {CONVERSION_EVENT})")
    print(f"  - Countries: US, CA, GB, DE, NL, SE, DK, IE")
    print(f"  - Age: 21-55")
    print(f"  - Ads: Sunset Lamp, RGB Panels, Wireless Charger, Floating Light")
    print("\nNext steps:")
    print("1. Review ads in Meta Ads Manager")
    print("2. If no Purchase data yet, switch to ADD_TO_CART in script and re-run")
    print("3. Turn on campaign when ready")


if __name__ == "__main__":
    main()
