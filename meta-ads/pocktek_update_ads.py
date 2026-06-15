"""
Pocktek - Update/Add new ads to existing campaign
Replace weak performers, add new products
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

ACCESS_TOKEN = os.getenv('FB_ACCESS_TOKEN')
AD_ACCOUNT_ID = os.getenv('FB_AD_ACCOUNT_ID')
PAGE_ID = os.getenv('FB_PAGE_ID')

API_VERSION = 'v25.0'
BASE_URL = f'https://graph.facebook.com/{API_VERSION}'

SITE_URL = "https://pocktek.myshopify.com"
IMAGE_DIR = os.path.join(os.path.dirname(__file__), "pocktek_images")

# Ad set IDs from existing campaign
ADSET_TECH = "120249165157490310"  # Tech Enthusiasts
ADSET_BROAD = "120249165158370310"  # Broad Audience

# New ads to create (replacing weak performers)
NEW_ADS = [
    {
        "name": "Ad 5 - RGB Desk Setup",
        "primary_text": "Level up your desk with modular RGB lighting.\nTouch-activated hexagon panels. Easy to install, endless layouts.",
        "headline": "RGB Hex Light Panels",
        "description": "Shop Pocktek",
        "link": f"{SITE_URL}/products/hexaglow-rgb-light-panels-3-pack-hexagon-modular-led-lights-with-touch-activation-remote-control",
        "image_file": "hexaglow-rgb-panels.png",
    },
    {
        "name": "Ad 6 - Sunset Aesthetic",
        "primary_text": "Create the perfect vibe in seconds.\nUSB-powered sunset lamp. Great for photos, videos, or just relaxing.",
        "headline": "Sunset Lamp Projector",
        "description": "Shop Pocktek",
        "link": f"{SITE_URL}/products/sunset-lamp-projector-sunset-projection-lamp-romantic-visual-led-light-sun-sunset-light-projector-180-degree-rotation-usb-charging-night-light-projector-for-bedroom-photography-selfie",
        "image_file": "sunset-lamp-projector.png",
    },
]


def upload_image(image_path):
    """Upload an image to the ad account and return the hash."""
    print(f"Uploading: {os.path.basename(image_path)}...")

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/adimages"

    with open(image_path, 'rb') as f:
        files = {'filename': f}
        params = {'access_token': ACCESS_TOKEN}
        response = requests.post(url, params=params, files=files)

    data = response.json()

    if "error" in data:
        print(f"Error uploading: {data['error']}")
        return None

    images = data.get('images', {})
    for key, value in images.items():
        image_hash = value.get('hash')
        print(f"  Hash: {image_hash}")
        return image_hash

    return None


def create_ad_creative(ad_config, image_hash):
    """Create an ad creative with image."""
    print(f"Creating creative: {ad_config['name']}...")

    object_story_spec = {
        "page_id": PAGE_ID,
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
        print(f"Error: {data['error']}")
        return None

    creative_id = data["id"]
    print(f"  Creative ID: {creative_id}")
    return creative_id


def create_ad(adset_id, creative_id, name):
    """Create an ad in an ad set."""
    print(f"Creating ad: {name}...")

    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/ads"
    params = {
        "access_token": ACCESS_TOKEN,
        "adset_id": adset_id,
        "creative": f'{{"creative_id": "{creative_id}"}}',
        "name": name,
        "status": "ACTIVE",
    }

    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error: {data['error']}")
        return None

    ad_id = data["id"]
    print(f"  Ad ID: {ad_id}")
    return ad_id


def pause_ad(ad_id, ad_name):
    """Pause an underperforming ad."""
    print(f"Pausing ad: {ad_name} ({ad_id})...")

    url = f"{BASE_URL}/{ad_id}"
    params = {
        "access_token": ACCESS_TOKEN,
        "status": "PAUSED",
    }

    response = requests.post(url, params=params)
    data = response.json()

    if "error" in data:
        print(f"Error: {data['error']}")
        return False

    print("  Paused successfully")
    return True


def get_ads_to_pause():
    """Get Ad 2 (Cable Mess) ads to pause."""
    url = f"{BASE_URL}/act_{AD_ACCOUNT_ID}/ads"
    params = {
        "access_token": ACCESS_TOKEN,
        "fields": "id,name,status",
        "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": "Cable Mess"}])
    }

    response = requests.get(url, params=params)
    data = response.json()

    return data.get("data", [])


def main():
    print("=" * 60)
    print("POCKTEK - UPDATING ADS")
    print("=" * 60)

    # Step 1: Pause underperforming Cable Mess ads
    print("\n--- PAUSING WEAK PERFORMERS ---")
    ads_to_pause = get_ads_to_pause()
    for ad in ads_to_pause:
        if ad.get("status") == "ACTIVE":
            pause_ad(ad["id"], ad["name"])

    # Step 2: Upload new images
    print("\n--- UPLOADING NEW IMAGES ---")
    image_hashes = {}
    for ad_config in NEW_ADS:
        image_path = os.path.join(IMAGE_DIR, ad_config["image_file"])
        if os.path.exists(image_path):
            image_hash = upload_image(image_path)
            if image_hash:
                image_hashes[ad_config["image_file"]] = image_hash
        else:
            print(f"Image not found: {image_path}")

    if not image_hashes:
        print("No images uploaded. Stopping.")
        return

    # Step 3: Create new ads in both ad sets
    print("\n--- CREATING NEW ADS ---")
    for ad_config in NEW_ADS:
        image_hash = image_hashes.get(ad_config["image_file"])
        if not image_hash:
            print(f"Skipping {ad_config['name']} - no image")
            continue

        creative_id = create_ad_creative(ad_config, image_hash)
        if creative_id:
            # Add to Tech Enthusiasts
            create_ad(ADSET_TECH, creative_id, f"{ad_config['name']} - Tech")
            # Add to Broad Audience
            create_ad(ADSET_BROAD, creative_id, f"{ad_config['name']} - Broad")

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)
    print("\nNew ads added:")
    for ad in NEW_ADS:
        print(f"  - {ad['name']}")
    print("\nPaused: Ad 2 (Cable Mess) - lowest CTR")


if __name__ == "__main__":
    main()
