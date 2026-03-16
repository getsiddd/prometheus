"""Headless calibration backend commands used by the browser/API workflow."""

import argparse
import json
import os
import sys
from typing import List

import cv2
import numpy as np
import yaml


def parse_source(source: str):
    """Parse numeric source strings as camera indices, otherwise keep as path/URL."""
    return int(source) if str(source).isdigit() else source


def parse_checkerboard(spec: str):
    """Parse checkerboard inner-corner spec like ``9x6`` into integer tuple."""
    parts = str(spec).lower().split("x")
    if len(parts) != 2:
        raise RuntimeError("Checkerboard must be like 9x6")
    return int(parts[0]), int(parts[1])


def snapshot(source: str, output_path: str):
    """Capture and save a single frame from a camera/video source."""
    src = parse_source(source)
    cap = cv2.VideoCapture(src)

    if not cap.isOpened():
        raise RuntimeError(f"Cannot open source: {source}")

    frame = None
    for _ in range(12):
        ok, f = cap.read()
        if ok and f is not None:
            frame = f

    cap.release()

    if frame is None:
        raise RuntimeError("Could not read frame from source")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    ok = cv2.imwrite(output_path, frame)
    if not ok:
        raise RuntimeError("Failed to write snapshot image")


def load_intrinsics(npz_path: str, fallback_size=(1280, 720)):
    """Load intrinsics from file or return a simple fallback pinhole model."""
    if npz_path and os.path.exists(npz_path):
        data = np.load(npz_path)
        K = data["K"]
        D = data["D"]
        return K, D

    width, height = fallback_size
    fx = fy = max(width, height) * 0.9
    cx = width / 2.0
    cy = height / 2.0
    K = np.array([[fx, 0.0, cx], [0.0, fy, cy], [0.0, 0.0, 1.0]], dtype=np.float64)
    D = np.zeros((1, 5), dtype=np.float64)
    return K, D


def solve_pnp(correspondences: List[dict], intrinsics_path: str, output_yaml: str):
    """Solve camera pose from correspondences and save a YAML result payload."""
    object_points = []
    image_points = []

    for item in correspondences:
        w = item.get("world")
        p = item.get("pixel")
        if not w or not p or len(w) != 3 or len(p) != 2:
            continue
        object_points.append([float(w[0]), float(w[1]), float(w[2])])
        image_points.append([float(p[0]), float(p[1])])

    if len(object_points) < 4:
        raise RuntimeError("At least 4 valid correspondences are required")

    object_arr = np.array(object_points, dtype=np.float32)
    image_arr = np.array(image_points, dtype=np.float32)

    K, D = load_intrinsics(intrinsics_path)

    ok, rvec, tvec, inliers = cv2.solvePnPRansac(
        object_arr,
        image_arr,
        K,
        D,
        flags=cv2.SOLVEPNP_ITERATIVE,
        reprojectionError=4.0,
        confidence=0.99,
    )

    if not ok:
        ok, rvec, tvec = cv2.solvePnP(object_arr, image_arr, K, D, flags=cv2.SOLVEPNP_ITERATIVE)
        inliers = None
        if not ok:
            raise RuntimeError("solvePnP failed")

    projected, _ = cv2.projectPoints(object_arr, rvec, tvec, K, D)
    projected = projected.reshape(-1, 2)
    err = np.linalg.norm(projected - image_arr, axis=1)
    rmse = float(np.sqrt(np.mean(np.square(err))))

    result = {
        "mode": "web_headless_pnp",
        "intrinsic": {
            "K": K.tolist(),
            "D": D.tolist(),
        },
        "pose": {
            "rvec": rvec.reshape(-1).tolist(),
            "tvec": tvec.reshape(-1).tolist(),
            "reproj_rmse_px": rmse,
            "inliers": int(len(inliers)) if inliers is not None else len(object_points),
        },
        "correspondences": correspondences,
    }

    os.makedirs(os.path.dirname(output_yaml), exist_ok=True)
    with open(output_yaml, "w", encoding="utf-8") as f:
        yaml.safe_dump(result, f, sort_keys=False)

    return result


def detect_checkerboard(image_path: str, checkerboard_spec: str):
    """Detect checkerboard corners in an image and return detection metadata."""
    if not os.path.exists(image_path):
        raise RuntimeError(f"Image not found: {image_path}")

    frame = cv2.imread(image_path)
    if frame is None:
        raise RuntimeError("Could not decode image")

    w, h = parse_checkerboard(checkerboard_spec)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    found, corners = cv2.findChessboardCorners(gray, (w, h), None)

    return {
        "found": bool(found),
        "corner_count": int(0 if corners is None else len(corners)),
        "image_width": int(frame.shape[1]),
        "image_height": int(frame.shape[0]),
    }


def solve_intrinsic(images_dir: str, checkerboard_spec: str, square_size: float, output_npz: str):
    """Solve camera intrinsics from checkerboard image directory and save ``.npz`` output."""
    if not os.path.isdir(images_dir):
        raise RuntimeError(f"Images directory not found: {images_dir}")

    w, h = parse_checkerboard(checkerboard_spec)

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

    os.makedirs(os.path.dirname(output_npz), exist_ok=True)
    np.savez(output_npz, K=K, D=D, rms=np.array([ret], dtype=np.float32))

    return {
        "valid_image_count": len(valid_images),
        "rms": float(ret),
        "K": K.tolist(),
        "D": D.tolist(),
        "output_npz": output_npz,
    }


def generate_checkerboard_pdf(checkerboard_spec: str, square_mm: float, output_pdf: str, margin_mm: float = 10.0):
    """Generate an A3 landscape checkerboard PDF for intrinsic calibration capture."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except Exception as exc:
        raise RuntimeError(f"reportlab is required to generate PDF: {exc}")

    inner_w, inner_h = parse_checkerboard(checkerboard_spec)
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

    os.makedirs(os.path.dirname(output_pdf), exist_ok=True)

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


def _load_pose_and_intrinsics(calibration_yaml: str, intrinsics_path: str = ""):
    """Load pose and intrinsics for validation from calibration YAML and optional NPZ intrinsics."""
    if not calibration_yaml or not os.path.exists(calibration_yaml):
        raise RuntimeError(f"Calibration YAML not found: {calibration_yaml}")

    with open(calibration_yaml, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    pose = data.get("pose") or {}
    intrinsic = data.get("intrinsic") or {}

    rvec_raw = pose.get("rvec")
    tvec_raw = pose.get("tvec")
    if rvec_raw is None or tvec_raw is None:
        raise RuntimeError("Calibration YAML does not contain pose.rvec/tvec")

    rvec = np.array(rvec_raw, dtype=np.float64).reshape(-1)
    tvec = np.array(tvec_raw, dtype=np.float64).reshape(-1)
    if rvec.size != 3 or tvec.size != 3:
        raise RuntimeError("pose.rvec and pose.tvec must each contain 3 values")

    if intrinsics_path:
        K, D = load_intrinsics(intrinsics_path)
    else:
        K_raw = intrinsic.get("K")
        D_raw = intrinsic.get("D")
        if K_raw is None or D_raw is None:
            raise RuntimeError("Calibration YAML does not contain intrinsic.K/D and no --intrinsics path was provided")
        K = np.array(K_raw, dtype=np.float64)
        D = np.array(D_raw, dtype=np.float64)

    if K.shape != (3, 3):
        raise RuntimeError(f"Intrinsic matrix K must be 3x3, got {K.shape}")

    D = np.array(D, dtype=np.float64)
    if D.ndim == 1:
        D = D.reshape(1, -1)

    return K, D, rvec.reshape(3, 1), tvec.reshape(3, 1)


def _pixel_to_world_on_plane(mx, my, K, D, rvec, tvec, plane_z=0.0):
    """Back-project an image pixel to a target world Z plane."""
    R, _ = cv2.Rodrigues(rvec)
    R_inv = R.T

    pt = np.array([[[mx, my]]], dtype=np.float64)
    pt_undist = cv2.undistortPoints(pt, K, D)
    x_u, y_u = pt_undist.reshape(2)
    ray_cam = np.array([x_u, y_u, 1.0], dtype=np.float64)
    ray_cam = ray_cam / np.linalg.norm(ray_cam)

    ray_world = R_inv @ ray_cam
    cam_center_world = -R_inv @ tvec.reshape(3)

    if abs(ray_world[2]) < 1e-9:
        return None

    t = (float(plane_z) - cam_center_world[2]) / ray_world[2]
    return cam_center_world + t * ray_world


def _world_to_pixel(world_xyz, K, D, rvec, tvec):
    """Project a world XYZ point into pixel coordinates."""
    arr = np.array([[float(world_xyz[0]), float(world_xyz[1]), float(world_xyz[2])]], dtype=np.float32)
    projected, _ = cv2.projectPoints(arr, rvec, tvec, K, D)
    u, v = projected.reshape(-1, 2)[0]
    return np.array([float(u), float(v)], dtype=np.float64)


def _metric_summary(values):
    """Compute mean, RMSE, and max statistics for scalar error values."""
    arr = np.array(values, dtype=np.float64)
    return {
        "mean": float(np.mean(arr)),
        "rmse": float(np.sqrt(np.mean(np.square(arr)))),
        "max": float(np.max(arr)),
    }


def validate_mapping(validation_points: List[dict], calibration_yaml: str, intrinsics_path: str = ""):
    """Validate pixel-to-world and world-to-pixel accuracy using known test points."""
    if not isinstance(validation_points, list) or len(validation_points) == 0:
        raise RuntimeError("validation_points must be a non-empty list")

    K, D, rvec, tvec = _load_pose_and_intrinsics(calibration_yaml, intrinsics_path)

    details = []
    world_errors = []
    reproj_errors = []

    for idx, item in enumerate(validation_points):
        world_raw = item.get("world")
        pixel_raw = item.get("pixel")
        if not world_raw or not pixel_raw or len(world_raw) != 3 or len(pixel_raw) != 2:
            continue

        world_gt = np.array([float(world_raw[0]), float(world_raw[1]), float(world_raw[2])], dtype=np.float64)
        pixel_obs = np.array([float(pixel_raw[0]), float(pixel_raw[1])], dtype=np.float64)
        plane_z = float(item.get("plane_z", world_gt[2]))

        world_est = _pixel_to_world_on_plane(pixel_obs[0], pixel_obs[1], K, D, rvec, tvec, plane_z=plane_z)
        if world_est is None:
            continue

        pixel_reproj = _world_to_pixel(world_gt, K, D, rvec, tvec)

        world_error = float(np.linalg.norm(world_est - world_gt))
        reproj_error = float(np.linalg.norm(pixel_reproj - pixel_obs))

        world_errors.append(world_error)
        reproj_errors.append(reproj_error)

        details.append(
            {
                "index": idx,
                "pixel_observed": [float(pixel_obs[0]), float(pixel_obs[1])],
                "world_expected": [float(world_gt[0]), float(world_gt[1]), float(world_gt[2])],
                "world_estimated": [float(world_est[0]), float(world_est[1]), float(world_est[2])],
                "world_error": world_error,
                "pixel_reprojected": [float(pixel_reproj[0]), float(pixel_reproj[1])],
                "reprojection_error_px": reproj_error,
            }
        )

    if len(details) == 0:
        raise RuntimeError("No valid validation points were provided")

    return {
        "mode": "web_validation",
        "calibration_yaml": calibration_yaml,
        "sample_count": len(details),
        "metrics": {
            "world_error": _metric_summary(world_errors),
            "reprojection_error_px": _metric_summary(reproj_errors),
        },
        "details": details,
    }


def main():
    """CLI entrypoint that dispatches snapshot, solve, detect, and PDF subcommands."""
    parser = argparse.ArgumentParser(description="Calibration2 web backend helper (headless)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_snap = sub.add_parser("snapshot")
    p_snap.add_argument("--source", required=True)
    p_snap.add_argument("--output", required=True)

    p_solve = sub.add_parser("solve-pnp")
    p_solve.add_argument("--correspondences-json", required=True)
    p_solve.add_argument("--intrinsics", default="")
    p_solve.add_argument("--output-yaml", required=True)

    p_detect = sub.add_parser("intrinsic-detect")
    p_detect.add_argument("--image", required=True)
    p_detect.add_argument("--checkerboard", default="9x6")

    p_intr = sub.add_parser("intrinsic-solve")
    p_intr.add_argument("--images-dir", required=True)
    p_intr.add_argument("--checkerboard", default="9x6")
    p_intr.add_argument("--square-size", type=float, default=0.024)
    p_intr.add_argument("--output-npz", required=True)

    p_pdf = sub.add_parser("checkerboard-pdf")
    p_pdf.add_argument("--checkerboard", default="9x6")
    p_pdf.add_argument("--square-mm", type=float, default=30.0)
    p_pdf.add_argument("--margin-mm", type=float, default=10.0)
    p_pdf.add_argument("--output-pdf", required=True)

    p_validate = sub.add_parser("validate-mapping")
    p_validate.add_argument("--validation-json", required=True)
    p_validate.add_argument("--calibration-yaml", required=True)
    p_validate.add_argument("--intrinsics", default="")

    args = parser.parse_args()

    if args.cmd == "snapshot":
        snapshot(args.source, args.output)
        print(json.dumps({"ok": True, "output": args.output}))
        return

    if args.cmd == "solve-pnp":
        correspondences = json.loads(args.correspondences_json)
        result = solve_pnp(correspondences, args.intrinsics, args.output_yaml)
        print(json.dumps({"ok": True, "result": result, "output": args.output_yaml}))
        return

    if args.cmd == "intrinsic-detect":
        result = detect_checkerboard(args.image, args.checkerboard)
        print(json.dumps({"ok": True, "result": result}))
        return

    if args.cmd == "intrinsic-solve":
        result = solve_intrinsic(args.images_dir, args.checkerboard, args.square_size, args.output_npz)
        print(json.dumps({"ok": True, "result": result, "output": args.output_npz}))
        return

    if args.cmd == "checkerboard-pdf":
        result = generate_checkerboard_pdf(args.checkerboard, args.square_mm, args.output_pdf, args.margin_mm)
        print(json.dumps({"ok": True, "result": result, "output": args.output_pdf}))
        return

    if args.cmd == "validate-mapping":
        points = json.loads(args.validation_json)
        result = validate_mapping(points, args.calibration_yaml, args.intrinsics)
        print(json.dumps({"ok": True, "result": result}))
        return


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
