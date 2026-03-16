"""Interactive desktop calibration pipeline for CAD-assisted camera-to-world mapping."""

import argparse
import os
import time

import cv2
import numpy as np

from camera_source import CameraSource
from cad_dwg import (
    CADViewState,
    load_dwg_geometry_3d,
    nearest_vertex_world_3d,
    render_cad_canvas_3d,
)
from intrinsic import (
    calibrate_intrinsics,
    load_intrinsics,
    parse_checkerboard,
    save_intrinsics,
)
from web_backend_services import WebCalibrationBackend


def capture_reference_frame(source):
    """Show live camera view and return a user-approved reference frame."""
    cv2.namedWindow("Capture Reference", cv2.WINDOW_NORMAL)
    last_frame = None

    while True:
        frame = source.read()
        if frame is None:
            frame = last_frame
            if frame is None:
                key = cv2.waitKey(10) & 0xFF
                if key == ord("q"):
                    raise RuntimeError("Reference frame capture cancelled")
                continue

        last_frame = frame.copy()

        vis = frame.copy()
        cv2.putText(
            vis,
            "Press SPACE / ENTER / C to capture reference frame | Q to cancel",
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 255),
            2,
        )

        cv2.imshow("Capture Reference", vis)
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            raise RuntimeError("Reference frame capture cancelled")

        if key in (ord(" "), ord("c"), 13, 10):
            cv2.destroyWindow("Capture Reference")
            return frame


def collect_correspondences_3d(ref_frame, segments3d, vertices3d):
    """Collect matched 3D CAD points and 2D image points through interactive picking."""
    object_points = []
    image_points = []
    view_state = CADViewState()
    projected_vertices = []

    selected_world_pending = []
    cad_vis_cached = None
    cad_dirty = True

    def find_projected(world_xyz):
        """Return current projected screen position for a selected CAD world vertex."""
        wx, wy, wz = world_xyz
        for vw, screen_xy, _ in projected_vertices:
            if (
                abs(vw[0] - wx) < 1e-6
                and abs(vw[1] - wy) < 1e-6
                and abs(vw[2] - wz) < 1e-6
            ):
                return screen_xy
        return None

    def on_cad_click(event, x, y, *_):
        """Handle CAD window click and queue nearest snapped 3D world point."""
        if event != cv2.EVENT_LBUTTONDOWN:
            return
        snapped = nearest_vertex_world_3d((x, y), projected_vertices, max_px=25)
        if snapped is None:
            return
        selected_world_pending.append(snapped)
        nonlocal cad_dirty
        cad_dirty = True

    def on_img_click(event, x, y, *_):
        """Handle image click and finalize a CAD-world to image-pixel correspondence pair."""
        if event != cv2.EVENT_LBUTTONDOWN:
            return
        if not selected_world_pending:
            return

        world_xyz = selected_world_pending.pop(0)
        object_points.append(world_xyz)
        image_points.append((float(x), float(y)))
        nonlocal cad_dirty
        cad_dirty = True

    cv2.namedWindow("CAD Select", cv2.WINDOW_NORMAL)
    cv2.namedWindow("Image Select", cv2.WINDOW_NORMAL)

    cv2.setMouseCallback("CAD Select", on_cad_click)
    cv2.setMouseCallback("Image Select", on_img_click)

    while True:
        if cad_dirty or cad_vis_cached is None:
            cad_vis_cached, projected_vertices, _ = render_cad_canvas_3d(
                segments3d,
                vertices3d,
                state=view_state,
            )
            cad_dirty = False

        cad_vis = cad_vis_cached.copy()
        img_vis = ref_frame.copy()

        for i, world_xyz in enumerate(object_points):
            screen = find_projected(world_xyz)
            if screen is not None:
                cv2.circle(cad_vis, screen, 5, (0, 255, 0), -1)
                cv2.putText(cad_vis, str(i + 1), (screen[0] + 6, screen[1] - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        for i, (ix, iy) in enumerate(image_points):
            p = (int(ix), int(iy))
            cv2.circle(img_vis, p, 6, (0, 0, 255), -1)
            cv2.putText(img_vis, str(i + 1), (p[0] + 6, p[1] - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        cv2.putText(
            cad_vis,
            f"CAD points: {len(object_points)}",
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 0),
            2,
        )
        cv2.putText(
            img_vis,
            f"Image points: {len(image_points)}",
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 0),
            2,
        )

        hint = "S=solve | Z=undo | C=clear | Q=quit"
        cv2.putText(cad_vis, hint, (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 1)
        cv2.putText(
            cad_vis,
            "Rotate: I/K pitch J/L yaw U/O roll +/- zoom F/H/G/T pan R reset",
            (20, 88),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            1,
        )
        cv2.putText(img_vis, hint, (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 1)

        cv2.imshow("CAD Select", cad_vis)
        cv2.imshow("Image Select", img_vis)

        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            raise RuntimeError("Correspondence collection cancelled")

        if key == ord("c"):
            object_points.clear()
            image_points.clear()
            selected_world_pending.clear()
            cad_dirty = True

        if key == ord("z"):
            if selected_world_pending:
                selected_world_pending.pop()
            elif len(object_points) > 0:
                object_points.pop()
                image_points.pop()
            cad_dirty = True

        if key == ord("i"):
            view_state.pitch_deg -= 3
            cad_dirty = True
        if key == ord("k"):
            view_state.pitch_deg += 3
            cad_dirty = True
        if key == ord("j"):
            view_state.yaw_deg -= 3
            cad_dirty = True
        if key == ord("l"):
            view_state.yaw_deg += 3
            cad_dirty = True
        if key == ord("u"):
            view_state.roll_deg -= 3
            cad_dirty = True
        if key == ord("o"):
            view_state.roll_deg += 3
            cad_dirty = True
        if key in (ord("+"), ord("=")):
            view_state.zoom *= 1.08
            cad_dirty = True
        if key in (ord("-"), ord("_")):
            view_state.zoom /= 1.08
            cad_dirty = True
        if key == ord("f"):
            view_state.pan_x -= 10
            cad_dirty = True
        if key == ord("h"):
            view_state.pan_x += 10
            cad_dirty = True
        if key == ord("t"):
            view_state.pan_y += 10
            cad_dirty = True
        if key == ord("g"):
            view_state.pan_y -= 10
            cad_dirty = True
        if key == ord("r"):
            view_state = CADViewState()
            cad_dirty = True

        if key == ord("s"):
            if len(object_points) < 4 or len(image_points) < 4:
                print("Need at least 4 CAD points and 4 image points")
                continue
            if len(object_points) != len(image_points):
                print("CAD and image point counts must match")
                continue
            break

    cv2.destroyWindow("CAD Select")
    cv2.destroyWindow("Image Select")

    object_arr = np.array(object_points, dtype=np.float32)
    image_arr = np.array(image_points, dtype=np.float32)

    return object_arr, image_arr


def solve_and_save_calibration_with_backend(
    backend: WebCalibrationBackend,
    object_points_xyz,
    image_points_uv,
    K,
    D,
    output_yaml,
    dwg_path,
    source,
    intrinsic_rms,
):
    """Solve and persist calibration through class-based backend service.

    This keeps desktop and web/headless calibration payload generation consistent by
    routing both through the same reusable backend class implementation.
    """
    result = backend.solve_pnp_from_arrays(
        object_points_xyz=object_points_xyz,
        image_points_uv=image_points_uv,
        K=K,
        D=D,
        output_yaml=output_yaml,
        mode="cad_3d_pnp",
        source=source,
        dwg_path=dwg_path,
        intrinsic_rms=intrinsic_rms,
    )

    pose = result.get("pose") or {}
    if "rvec" not in pose or "tvec" not in pose:
        raise RuntimeError("Backend solve result is missing pose vectors")

    rvec = np.array(pose["rvec"], dtype=np.float64).reshape(3, 1)
    tvec = np.array(pose["tvec"], dtype=np.float64).reshape(3, 1)
    rmse = float(pose.get("reproj_rmse_px", 0.0))
    inliers = int(pose.get("inliers", len(object_points_xyz)))
    return rvec, tvec, rmse, inliers


def build_projected_segments_3d(segments3d, rvec, tvec, K, D):
    """Project CAD 3D line segments into image pixel coordinates using solved pose."""
    points = []
    for a, b in segments3d:
        points.append(a)
        points.append(b)

    arr = np.array(points, dtype=np.float32)
    projected, _ = cv2.projectPoints(arr, rvec, tvec, K, D)
    projected = projected.reshape(-1, 2)

    idx = 0
    lines = []
    for _seg in segments3d:
        p1 = projected[idx]
        p2 = projected[idx + 1]
        idx += 2

        x1, y1 = int(round(p1[0])), int(round(p1[1]))
        x2, y2 = int(round(p2[0])), int(round(p2[1]))

        lines.append(((x1, y1), (x2, y2)))

    return lines


def draw_projected_lines(frame, lines, color=(0, 255, 0)):
    """Draw projected CAD overlay lines while skipping lines far outside the frame."""
    h, w = frame.shape[:2]
    for p1, p2 in lines:
        x1, y1 = p1
        x2, y2 = p2
        if (
            (x1 < -w and x2 < -w)
            or (x1 > 2 * w and x2 > 2 * w)
            or (y1 < -h and y2 < -h)
            or (y1 > 2 * h and y2 > 2 * h)
        ):
            continue
        cv2.line(frame, p1, p2, color, 1, cv2.LINE_AA)


def pixel_to_world_on_plane_z0(mx, my, K, D, rvec, tvec):
    """Back-project an image pixel onto the world plane ``z=0`` using camera pose."""
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

    t = -cam_center_world[2] / ray_world[2]
    world = cam_center_world + t * ray_world
    return world


def live_overlay_3d(source, K, D, rvec, tvec, segments3d, display_scale=1.0, max_fps=30):
    """Render live camera frames with projected CAD overlay and pixel-to-world readout."""
    state = {"mouse": (0, 0)}

    def mouse_cb(event, x, y, *_):
        """Track the current mouse position for world-coordinate inspection."""
        if event == cv2.EVENT_MOUSEMOVE:
            state["mouse"] = (x, y)

    cv2.namedWindow("Calibration2 Live", cv2.WINDOW_NORMAL)
    cv2.setMouseCallback("Calibration2 Live", mouse_cb)

    lines = build_projected_segments_3d(segments3d, rvec, tvec, K, D)

    if display_scale <= 0:
        display_scale = 1.0

    if max_fps <= 0:
        max_fps = 30

    frame_interval = 1.0 / float(max_fps)
    last_draw_time = 0.0

    while True:
        frame = source.read()
        if frame is None:
            continue

        now = time.time()
        if now - last_draw_time < frame_interval:
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            continue
        last_draw_time = now

        view = frame.copy()
        draw_projected_lines(view, lines)

        mx, my = state["mouse"]
        if display_scale != 1.0:
            mx_full = float(mx) / float(display_scale)
            my_full = float(my) / float(display_scale)
        else:
            mx_full = float(mx)
            my_full = float(my)

        world = pixel_to_world_on_plane_z0(mx_full, my_full, K, D, rvec, tvec)

        if world is not None:
            txt = f"World XYZ(z=0): ({world[0]:.3f}, {world[1]:.3f}, 0.000)"
        else:
            txt = "World XYZ(z=0): undefined"

        cv2.putText(view, txt, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        cv2.putText(view, f"Q=quit | scale={display_scale:.2f} | fps={max_fps}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

        if display_scale != 1.0:
            view = cv2.resize(view, None, fx=display_scale, fy=display_scale, interpolation=cv2.INTER_AREA)

        cv2.imshow("Calibration2 Live", view)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break

    cv2.destroyWindow("Calibration2 Live")


def main():
    """Run the complete interactive calibration2 workflow."""
    parser = argparse.ArgumentParser(description="Calibration2: 3D DWG camera calibration with interactive CAD rotation")
    parser.add_argument("--dwg", required=True, help="Path to DWG CAD file")
    parser.add_argument("--source", default="0", help="Camera source (index, rtsp url, or video file)")
    parser.add_argument("--output-dir", default="./output", help="Directory for calibration artifacts")
    parser.add_argument("--checkerboard", default="9x6", help="Checkerboard inner corners, e.g. 9x6")
    parser.add_argument("--square-size", type=float, default=0.024, help="Checker square size in meters")
    parser.add_argument("--min-samples", type=int, default=18, help="Min checkerboard captures for intrinsic")
    parser.add_argument("--force-intrinsic", action="store_true", help="Recompute intrinsic even if file exists")
    parser.add_argument("--display-scale", type=float, default=0.65, help="Live display resize scale (lower = faster)")
    parser.add_argument("--max-fps", type=int, default=24, help="Maximum display FPS in live overlay")

    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    intrinsics_path = os.path.join(args.output_dir, "intrinsics.npz")
    calibration_yaml = os.path.join(args.output_dir, "calibration2.yaml")

    source = CameraSource(args.source)
    backend = WebCalibrationBackend()

    try:
        if os.path.exists(intrinsics_path) and not args.force_intrinsic:
            K, D, rms = load_intrinsics(intrinsics_path)
            print(f"[Intrinsic] Loaded existing: {intrinsics_path}, RMS={rms:.4f}")
        else:
            checker = parse_checkerboard(args.checkerboard)
            K, D, rms = calibrate_intrinsics(
                source,
                checkerboard=checker,
                square_size=args.square_size,
                min_samples=args.min_samples,
            )
            save_intrinsics(intrinsics_path, K, D, rms)
            print(f"[Intrinsic] Saved: {intrinsics_path}")

        segments3d, vertices3d, _bounds = load_dwg_geometry_3d(args.dwg)
        print(f"[CAD] Loaded 3D segments={len(segments3d)} vertices={len(vertices3d)}")

        ref = capture_reference_frame(source)
        object_pts, img_pts = collect_correspondences_3d(ref, segments3d, vertices3d)

        rvec, tvec, rmse, inliers = solve_and_save_calibration_with_backend(
            backend=backend,
            object_points_xyz=object_pts,
            image_points_uv=img_pts,
            K=K,
            D=D,
            output_yaml=calibration_yaml,
            dwg_path=args.dwg,
            source=args.source,
            intrinsic_rms=rms,
        )
        print(f"[PnP] RMSE={rmse:.4f}px | inliers={inliers}/{len(object_pts)}")

        print(f"[Calibration2] Saved: {calibration_yaml}")

        live_overlay_3d(
            source,
            K,
            D,
            rvec,
            tvec,
            segments3d,
            display_scale=args.display_scale,
            max_fps=args.max_fps,
        )

    finally:
        source.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
