"""
Download product images from Pocktek store
"""

import os
import re
import requests
import json

SITE_URL = "https://pocktek.myshopify.com"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "pocktek_images")


def get_collection_images():
    """Get product images from the collections JSON endpoint."""
    url = f"{SITE_URL}/collections/all/products.json"
    print(f"Fetching: {url}")

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        images = []
        for product in data.get('products', []):
            product_title = product.get('title', 'unknown')
            product_handle = product.get('handle', 'unknown')

            for i, image in enumerate(product.get('images', [])[:1]):  # First image only
                img_url = image.get('src', '')
                if img_url:
                    images.append({
                        'title': product_title,
                        'handle': product_handle,
                        'url': img_url
                    })

        return images

    except Exception as e:
        print(f"Error fetching collection: {e}")
        return []


def download_image(url, filename):
    """Download an image to the output directory."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()

        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, 'wb') as f:
            f.write(response.content)

        print(f"Downloaded: {filename}")
        return filepath
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return None


def main():
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 50)
    print("DOWNLOADING POCKTEK PRODUCT IMAGES")
    print("=" * 50)

    images = get_collection_images()
    downloaded = []

    for img in images:
        # Clean filename
        handle = img['handle']
        url = img['url']

        ext = 'jpg'
        if '.png' in url:
            ext = 'png'
        elif '.webp' in url:
            ext = 'webp'

        filename = f"{handle}.{ext}"
        filepath = download_image(url, filename)
        if filepath:
            downloaded.append({
                'title': img['title'],
                'file': filename,
                'path': filepath
            })

    print()
    print("=" * 50)
    print(f"Downloaded {len(downloaded)} images to: {OUTPUT_DIR}")
    print("=" * 50)

    # List downloaded files
    print("\nProducts:")
    for d in downloaded:
        print(f"  - {d['title']}: {d['file']}")


if __name__ == "__main__":
    main()
