"""Headless calibration backend CLI for browser/API workflows.

Core logic is intentionally class-based and modular under ``web_backend_services``.
This script only parses command-line arguments and dispatches to service classes.
"""

from __future__ import annotations

import argparse
import json
import sys

from web_backend_services import WebCalibrationBackend


def load_json_arg(raw: str, arg_name: str):
    """Parse JSON argument text and raise a clear command error on failure."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON for {arg_name}: {exc}") from exc


def add_matching_args(parser: argparse.ArgumentParser) -> None:
    """Attach reusable feature-matching options to a subcommand parser."""
    parser.add_argument("--match-method", default="auto", choices=["auto", "loftr", "orb"])
    parser.add_argument("--max-features", type=int, default=2048)
    parser.add_argument("--max-matches-per-pair", type=int, default=600)
    parser.add_argument("--min-confidence", type=float, default=0.35)
    parser.add_argument("--max-image-side", type=int, default=1280)
    parser.add_argument("--anchor-camera-id", default="")


def build_match_options(args) -> dict:
    """Extract feature-matching options from parsed command arguments."""
    options = {
        "method": args.match_method,
        "max_features": args.max_features,
        "max_matches_per_pair": args.max_matches_per_pair,
        "min_confidence": args.min_confidence,
        "max_image_side": args.max_image_side,
    }
    if args.anchor_camera_id:
        options["anchor_camera_id"] = args.anchor_camera_id
    return options


def build_parser() -> argparse.ArgumentParser:
    """Construct CLI parser with all supported subcommands."""
    parser = argparse.ArgumentParser(description="Calibration2 web backend helper (headless)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_snap = sub.add_parser("snapshot")
    p_snap.add_argument("--source", required=True)
    p_snap.add_argument("--output", required=True)

    p_solve = sub.add_parser("solve-pnp")
    p_solve.add_argument("--correspondences-json", required=True)
    p_solve.add_argument("--intrinsics", default="")
    p_solve.add_argument("--output-yaml", required=True)
    p_solve.add_argument("--mode", default="web_headless_pnp")
    p_solve.add_argument("--source", default="")
    p_solve.add_argument("--dwg-path", default="")
    p_solve.add_argument("--intrinsic-rms", type=float, default=None)

    p_detect = sub.add_parser("intrinsic-detect")
    p_detect.add_argument("--image", required=True)
    p_detect.add_argument("--checkerboard", default="9x6")

    p_intr = sub.add_parser("intrinsic-solve")
    p_intr.add_argument("--images-dir", required=True)
    p_intr.add_argument("--checkerboard", default="9x6")
    p_intr.add_argument("--square-size", type=float, default=0.024)
    p_intr.add_argument("--output-npz", required=True)
    p_intr.add_argument("--camera-type", default="pinhole", choices=["pinhole", "fisheye", "wide-angle", "cctv"])

    p_pdf = sub.add_parser("checkerboard-pdf")
    p_pdf.add_argument("--checkerboard", default="9x6")
    p_pdf.add_argument("--square-mm", type=float, default=30.0)
    p_pdf.add_argument("--margin-mm", type=float, default=10.0)
    p_pdf.add_argument("--output-pdf", required=True)

    p_validate = sub.add_parser("validate-mapping")
    p_validate.add_argument("--validation-json", required=True)
    p_validate.add_argument("--calibration-yaml", required=True)
    p_validate.add_argument("--intrinsics", default="")

    p_pose_ground = sub.add_parser("detect-ground-pose")
    p_pose_ground.add_argument("--image", required=True)
    p_pose_ground.add_argument("--max-side", type=int, default=960)
    p_pose_ground.add_argument("--min-person-score", type=float, default=0.65)
    p_pose_ground.add_argument("--min-keypoint-score", type=float, default=0.35)

    p_triangulate = sub.add_parser("triangulate-multiview")
    p_triangulate.add_argument("--cameras-json", required=True)
    p_triangulate.add_argument("--markers-json", required=True)
    p_triangulate.add_argument("--auto-match", action="store_true")
    add_matching_args(p_triangulate)

    p_match = sub.add_parser("match-features-multiview")
    p_match.add_argument("--cameras-json", required=True)
    add_matching_args(p_match)

    return parser


def main() -> None:
    """CLI entrypoint that dispatches commands to backend service classes."""
    parser = build_parser()
    args = parser.parse_args()
    backend = WebCalibrationBackend()

    if args.cmd == "snapshot":
        backend.snapshot(args.source, args.output)
        print(json.dumps({"ok": True, "output": args.output}))
        return

    if args.cmd == "solve-pnp":
        correspondences = load_json_arg(args.correspondences_json, "--correspondences-json")
        result = backend.solve_pnp(
            correspondences,
            args.intrinsics,
            args.output_yaml,
            mode=args.mode,
            source=args.source or None,
            dwg_path=args.dwg_path or None,
            intrinsic_rms=args.intrinsic_rms,
        )
        print(json.dumps({"ok": True, "result": result, "output": args.output_yaml}))
        return

    if args.cmd == "intrinsic-detect":
        result = backend.detect_checkerboard(args.image, args.checkerboard)
        print(json.dumps({"ok": True, "result": result}))
        return

    if args.cmd == "intrinsic-solve":
        result = backend.solve_intrinsic(args.images_dir, args.checkerboard, args.square_size, args.output_npz, camera_type=args.camera_type)
        print(json.dumps({"ok": True, "result": result, "output": args.output_npz}))
        return

    if args.cmd == "checkerboard-pdf":
        result = backend.generate_checkerboard_pdf(args.checkerboard, args.square_mm, args.output_pdf, args.margin_mm)
        print(json.dumps({"ok": True, "result": result, "output": args.output_pdf}))
        return

    if args.cmd == "validate-mapping":
        points = load_json_arg(args.validation_json, "--validation-json")
        result = backend.validate_mapping(points, args.calibration_yaml, args.intrinsics)
        print(json.dumps({"ok": True, "result": result}))
        return

    if args.cmd == "detect-ground-pose":
        result = backend.detect_ground_points_from_pose(
            args.image,
            max_side=args.max_side,
            min_person_score=args.min_person_score,
            min_keypoint_score=args.min_keypoint_score,
        )
        print(json.dumps({"ok": True, "result": result}))
        return

    if args.cmd == "triangulate-multiview":
        cameras = load_json_arg(args.cameras_json, "--cameras-json")
        markers = load_json_arg(args.markers_json, "--markers-json")
        result = backend.triangulate_multiview(
            cameras,
            markers,
            auto_match=args.auto_match,
            match_options=build_match_options(args),
        )
        print(json.dumps({"ok": True, "result": result}))
        return

    if args.cmd == "match-features-multiview":
        cameras = load_json_arg(args.cameras_json, "--cameras-json")
        result = backend.match_multiview_features(cameras, match_options=build_match_options(args))
        print(json.dumps({"ok": True, "result": result}))
        return


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
