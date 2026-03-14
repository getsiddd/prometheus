# generate_apriltags_a3.py

import cv2
import numpy as np
import os
from reportlab.platypus import SimpleDocTemplate, Image
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import A3
from reportlab.pdfbase import pdfmetrics

# ==============================
# CONFIGURATION
# ==============================

OUTPUT_DIR = "generated_tags_a3"
TAG_IDS = [0, 1, 2, 3]
TAG_FAMILY = cv2.aruco.DICT_APRILTAG_36h11

DPI = 300
PAGE_WIDTH_MM = 297   # A3 width
PAGE_HEIGHT_MM = 420  # A3 height

PRINT_MARGIN_MM = 15   # slightly larger safe margin for big prints
GENERATE_PNG = True

# ==============================
# SETUP
# ==============================

os.makedirs(OUTPUT_DIR, exist_ok=True)

dictionary = cv2.aruco.getPredefinedDictionary(TAG_FAMILY)

# Convert mm to pixels
pixels_per_mm = DPI / 25.4

usable_width_mm = PAGE_WIDTH_MM - (2 * PRINT_MARGIN_MM)
usable_height_mm = PAGE_HEIGHT_MM - (2 * PRINT_MARGIN_MM)

# Square tag fitting inside A3
tag_size_mm = min(usable_width_mm, usable_height_mm)
tag_pixels = int(tag_size_mm * pixels_per_mm)

print(f"[INFO] Tag size will be approx {tag_size_mm:.1f} mm (~{tag_size_mm/10:.1f} cm)")
print(f"[INFO] Pixel size: {tag_pixels} x {tag_pixels}")

# ==============================
# GENERATE TAGS
# ==============================

for tag_id in TAG_IDS:

    # Generate tag image
    tag_img = np.zeros((tag_pixels, tag_pixels), dtype=np.uint8)
    cv2.aruco.generateImageMarker(dictionary, tag_id, tag_pixels, tag_img, 1)

    png_path = os.path.join(OUTPUT_DIR, f"april_tag_id_{tag_id}.png")

    if GENERATE_PNG:
        cv2.imwrite(png_path, tag_img)

    pdf_path = os.path.join(OUTPUT_DIR, f"april_tag_id_{tag_id}.pdf")
    doc = SimpleDocTemplate(pdf_path, pagesize=A3)

    elements = []

    img = Image(
        png_path,
        width=tag_size_mm * mm,
        height=tag_size_mm * mm
    )

    elements.append(img)
    doc.build(elements)

    print(f"[✔] Generated A3 tag for ID {tag_id} → {pdf_path}")

print("\n✅ DONE.")
print("IMPORTANT PRINT SETTINGS:")
print("- Paper size: A3")
print("- Print at 100% scale")
print("- Disable 'Fit to page'")
print("- Use thick matte paper for outdoor use")
print("- Verify physical size with ruler before deployment")