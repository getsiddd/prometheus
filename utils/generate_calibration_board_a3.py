import os
import numpy as np
import cv2
from reportlab.platypus import SimpleDocTemplate, Image
from reportlab.lib.pagesizes import A3
from reportlab.lib.units import mm

# ==============================
# CONFIG
# ==============================

OUTPUT_DIR = "calibration_board"
os.makedirs(OUTPUT_DIR, exist_ok=True)

DPI = 300
PAGE_WIDTH_MM = 297
PAGE_HEIGHT_MM = 420

PRINT_MARGIN_MM = 10

# Chessboard settings
SQUARE_SIZE_MM = 30
INNER_CORNERS_X = 9
INNER_CORNERS_Y = 6

# ==============================
# CALCULATIONS
# ==============================

pixels_per_mm = DPI / 25.4

board_width_mm = (INNER_CORNERS_X + 1) * SQUARE_SIZE_MM
board_height_mm = (INNER_CORNERS_Y + 1) * SQUARE_SIZE_MM

board_width_px = int(board_width_mm * pixels_per_mm)
board_height_px = int(board_height_mm * pixels_per_mm)

print(f"[INFO] Board size: {board_width_mm}mm x {board_height_mm}mm")

# ==============================
# GENERATE CHESSBOARD
# ==============================

board = np.zeros((board_height_px, board_width_px), dtype=np.uint8)

square_px = int(SQUARE_SIZE_MM * pixels_per_mm)

for y in range(INNER_CORNERS_Y + 1):
    for x in range(INNER_CORNERS_X + 1):
        if (x + y) % 2 == 0:
            cv2.rectangle(
                board,
                (x * square_px, y * square_px),
                ((x + 1) * square_px, (y + 1) * square_px),
                255,
                -1
            )

png_path = os.path.join(OUTPUT_DIR, "calibration_board.png")
cv2.imwrite(png_path, board)

# ==============================
# EXPORT TO A3 PDF
# ==============================

pdf_path = os.path.join(OUTPUT_DIR, "calibration_board_A3.pdf")
doc = SimpleDocTemplate(pdf_path, pagesize=A3)

elements = []
img = Image(
    png_path,
    width=board_width_mm * mm,
    height=board_height_mm * mm
)
elements.append(img)
doc.build(elements)

print("[✔] Calibration board generated.")
print("IMPORTANT:")
print("- Print at 100% scale")
print("- Disable 'Fit to Page'")
print("- Verify square size with ruler (must be exactly 30mm)")