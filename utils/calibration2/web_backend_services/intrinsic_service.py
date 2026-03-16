"""Intrinsic calibration and checkerboard utility services."""

from __future__ import annotations

import os
from importlib import import_module

import cv2
import numpy as np

from .common import CalibrationUtils


class IntrinsicCalibrationService:
    """Detect checkerboards, solve intrinsics, and generate print-ready boards."""

    def __init__(self, utils: CalibrationUtils | None = None):
        self.utils = utils or CalibrationUtils()

    def detect_checkerboard(self, image_path: str, checkerboard_spec: str):
        """Detect checkerboard corners in an image and return detection metadata."""
        if not os.path.exists(image_path):
            raise RuntimeError(f"Image not found: {image_path}")

        frame = cv2.imread(image_path)
        if frame is None:
            raise RuntimeError("Could not decode image")

        w, h = self.utils.parse_checkerboard(checkerboard_spec)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        found, corners = cv2.findChessboardCorners(gray, (w, h), None)

        return {
            "found": bool(found),
            "corner_count": int(0 if corners is None else len(corners)),
            "image_width": int(frame.shape[1]),
            "image_height": int(frame.shape[0]),
        }

    def solve_intrinsic(self, images_dir: str, checkerboard_spec: str, square_size: float, output_npz: str):
        """Solve intrinsics from checkerboard images and save NPZ artifact."""
        if not os.path.isdir(images_dir):
            raise RuntimeError(f"Images directory not found: {images_dir}")

        w, h = self.utils.parse_checkerboard(checkerboard_spec)

        objp = np.zeros((w * h, 3), np.float32)
        objp[:, :2] = np.mgrid[0:w, 0:h].T.reshape(-1, 2)
        objp *= float(square_size)

        obj_points = []
        img_points = []
        frame_size = None
        valid_images = []

        files = sorted(
            [
                os.path.join(images_dir, name)
                for name in os.listdir(images_dir)
                if name.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
            ]
        )

        for file_path in files:
            frame = cv2.imread(file_path)
            if frame is None:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            found, corners = cv2.findChessboardCorners(gray, (w, h), None)
            if not found:
                continue

            refined = cv2.cornerSubPix(
                gray,
                corners,
                (11, 11),
                (-1, -1),
                (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001),
            )

            obj_points.append(objp.copy())
            img_points.append(refined)
            frame_size = gray.shape[::-1]
            valid_images.append(file_path)

        if len(obj_points) < 4:
            raise RuntimeError(f"Need at least 4 valid checkerboard images, found {len(obj_points)}")

        ret, K, D, _, _ = cv2.calibrateCamera(
            obj_points,
            img_points,
            frame_size,
            None,
            None,
        )

        self.utils.ensure_parent_dir(output_npz)
        np.savez(output_npz, K=K, D=D, rms=np.array([ret], dtype=np.float32))

        return {
            "valid_image_count": len(valid_images),
            "rms": float(ret),
            "K": K.tolist(),
            "D": D.tolist(),
            "output_npz": output_npz,
        }

    def generate_checkerboard_pdf(self, checkerboard_spec: str, square_mm: float, output_pdf: str, margin_mm: float = 10.0):
        """Generate an A3 landscape checkerboard PDF."""
        try:
            colors = import_module("reportlab.lib.colors")
            units = import_module("reportlab.lib.units")
            pdfgen_canvas = import_module("reportlab.pdfgen.canvas")
        except Exception as exc:
            raise RuntimeError(f"reportlab is required to generate PDF: {exc}")

        mm = units.mm
        canvas = pdfgen_canvas

        inner_w, inner_h = self.utils.parse_checkerboard(checkerboard_spec)
        squares_w = inner_w + 1
        squares_h = inner_h + 1

        if square_mm <= 0:
            raise RuntimeError("square_mm must be > 0")

        page_w_mm = 420.0
        page_h_mm = 297.0

        board_w_mm = squares_w * float(square_mm)
        board_h_mm = squares_h * float(square_mm)

        printable_w = page_w_mm - 2.0 * margin_mm
        printable_h = page_h_mm - 2.0 * margin_mm
        if board_w_mm > printable_w or board_h_mm > printable_h:
            raise RuntimeError(
                f"Board {board_w_mm:.1f}x{board_h_mm:.1f} mm does not fit A3 landscape with {margin_mm:.1f} mm margins"
            )

        page_w_pt = page_w_mm * mm
        page_h_pt = page_h_mm * mm

        board_w_pt = board_w_mm * mm
        board_h_pt = board_h_mm * mm

        x0 = (page_w_pt - board_w_pt) / 2.0
        y0 = (page_h_pt - board_h_pt) / 2.0
        sq_pt = float(square_mm) * mm

        self.utils.ensure_parent_dir(output_pdf)

        c = canvas.Canvas(output_pdf, pagesize=(page_w_pt, page_h_pt))
        c.setTitle(f"Checkerboard {checkerboard_spec} A3 Landscape")

        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5)
        c.rect(x0, y0, board_w_pt, board_h_pt, stroke=1, fill=0)

        for row in range(squares_h):
            for col in range(squares_w):
                is_black = ((row + col) % 2) == 0
                if not is_black:
                    continue
                x = x0 + col * sq_pt
                y = y0 + (squares_h - 1 - row) * sq_pt
                c.setFillColor(colors.black)
                c.rect(x, y, sq_pt, sq_pt, stroke=0, fill=1)

        c.setFillColor(colors.black)
        c.setFont("Helvetica", 9)
        c.drawString(x0, y0 - 12, f"Checkerboard {checkerboard_spec} | square={square_mm} mm | Print at 100% (no fit/scale)")

        c.showPage()
        c.save()

        return {
            "output_pdf": output_pdf,
            "checkerboard": checkerboard_spec,
            "square_mm": float(square_mm),
            "page": "A3-landscape",
            "board_mm": [board_w_mm, board_h_mm],
            "margin_mm": float(margin_mm),
        }
