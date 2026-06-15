"""
Download new Pocktek product images for ad updates
"""

import os
import requests

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "pocktek_images")

PRODUCTS_TO_DOWNLOAD = [
    {
        "handle": "hexaglow-rgb-light-panels-3-pack-hexagon-modular-led-lights-with-touch-activation-remote-control",
        "name": "hexaglow-rgb-panels"
    },
    {
        "handle": "sunset-lamp-projector-sunset-projection-lamp-romantic-visual-led-light-sun-sunset-light-projector-180-degree-rotation-usb-charging-night-light-projector-for-bedroom-photography-selfie",
        "name": "sunset-lamp-projector"
    },
    {
        "handle": "20000mah-magsafe-power-bank-magnetic-wireless-powerbank-with-cable-stand-for-iphone-16-xiaomi-samsung-portable-induction-charger",
        "name": "magsafe-power-bank-20000mah"
    },
    {
        "handle": "usb-powered-led-monitor-light-bar-adjustable-brightness-33-cm-50-cm",
        "name": "monitor-light-bar"
    },
]

def get_product_image(handle):
    """Get first image URL from product JSON."""
    url = f"https://pocktek.myshopify.com/products/{handle}.json"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        images = data.get("product", {}).get("images", [])
        if images:
            return images[0].get("src")
    except Exception as e:
        print(f"Error fetching {handle}: {e}")
    return None

def download_image(url, filename):
    """Download image to output directory."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, 'wb') as f:
            f.write(response.content)
        print(f"Downloaded: {filename}")
        return filepath
    except Exception as e:
        print(f"Error downloading: {e}")
        return None

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 50)
    print("DOWNLOADING NEW POCKTEK IMAGES")
    print("=" * 50)

    for product in PRODUCTS_TO_DOWNLOAD:
        print(f"\nFetching: {product['name']}...")
        img_url = get_product_image(product["handle"])
        if img_url:
            download_image(img_url, f"{product['name']}.png")
        else:
            print(f"  No image found")

    print("\n" + "=" * 50)
    print("Done!")

if __name__ == "__main__":
    main()
