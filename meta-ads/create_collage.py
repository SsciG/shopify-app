"""
Create a product collage for Pocktek store ad
"""

from PIL import Image
import os

IMAGE_DIR = os.path.join(os.path.dirname(__file__), "pocktek_images")
OUTPUT_FILE = os.path.join(IMAGE_DIR, "pocktek-collage.png")

# Products to include in collage
PRODUCTS = [
    "3-in-1-magnetic-wireless-charging-station-for-iphone-12-16-pro-max-airpods-foldable-travel-dock-fast-charging-pad-compatible-for-apple-watch-android-phones.png",
    "32pcs-desk-under-cable-management-kit-cord-organizer-cable-raceway-cable-sleeve-adhesive-cable-clips-cord-clips-cable-organizer.png",
    "65w-flat-gan-usb-c-charger-dual-port-fast-wall-charger-compact-power-adapter-with-foldable-plug-for-mobile-phone.png",
    "metal-foldable-universal-tablet-holder-for-phone-holder-tablet-stand-adjustable-desk-support-flexible-phone-stand-2-size-태블릿-거치대.png",
]

def create_collage():
    """Create a 2x2 collage of product images."""

    # Load images
    images = []
    for filename in PRODUCTS:
        path = os.path.join(IMAGE_DIR, filename)
        if os.path.exists(path):
            img = Image.open(path)
            images.append(img)
            print(f"Loaded: {filename[:50]}...")

    if len(images) < 4:
        print(f"Only found {len(images)} images, need 4")
        return

    # Resize all to same size (600x600)
    size = (600, 600)
    resized = []
    for img in images[:4]:
        # Convert to RGB if needed
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # Resize maintaining aspect ratio, then crop to square
        img.thumbnail((800, 800), Image.Resampling.LANCZOS)

        # Create white background
        bg = Image.new('RGB', size, (255, 255, 255))

        # Paste centered
        offset = ((size[0] - img.width) // 2, (size[1] - img.height) // 2)
        bg.paste(img, offset)
        resized.append(bg)

    # Create 2x2 collage (1200x1200)
    collage = Image.new('RGB', (1200, 1200), (255, 255, 255))

    positions = [(0, 0), (600, 0), (0, 600), (600, 600)]
    for img, pos in zip(resized, positions):
        collage.paste(img, pos)

    # Add thin grid lines
    from PIL import ImageDraw
    draw = ImageDraw.Draw(collage)
    draw.line([(600, 0), (600, 1200)], fill=(240, 240, 240), width=2)
    draw.line([(0, 600), (1200, 600)], fill=(240, 240, 240), width=2)

    # Save
    collage.save(OUTPUT_FILE, 'PNG', quality=95)
    print(f"\nCollage saved: {OUTPUT_FILE}")
    print(f"Size: {collage.size}")

if __name__ == "__main__":
    create_collage()
