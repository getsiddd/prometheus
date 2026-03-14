# main.py
import cv2
import os
import numpy as np

from camera.frame_source import FrameSource
from calibration.intrinsic import intrinsic_calibration
from calibration.undistort import undistort
from calibration.extrinsic import compute_extrinsic
from calibration.homography import HomographyCalibrator

from detection.apriltag_detector import AprilTagDetector

from visualization.scene3d import Scene3D
from visualization.topview import TopViewScene

from storage.calibration_io import load_intrinsics
from config import *

def draw_help_overlay(frame):

    lines = [
        "Controls:",
        "O = Toggle Homography Origin",
        "X = Toggle Homography Axes",
        "B = Toggle Tag Bounding Boxes",
        "I = Toggle Tag IDs",
        "W = Toggle World Coordinates",
        "G = Toggle Floor Grid",
        "ESC = Exit"
    ]

    x = 20
    y = 80

    for i, line in enumerate(lines):

        cv2.putText(
            frame,
            line,
            (x, y + i*25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0,255,0),
            2
        )

    return frame

def handle_gui_keys(key):

    if key == KEY_BINDINGS["toggle_axes"]:
        GUI["SHOW_HOMOGRAPHY_AXES"] = not GUI["SHOW_HOMOGRAPHY_AXES"]

    if key == KEY_BINDINGS["toggle_origin"]:
        GUI["SHOW_HOMOGRAPHY_ORIGIN"] = not GUI["SHOW_HOMOGRAPHY_ORIGIN"]

    if key == KEY_BINDINGS["toggle_bbox"]:
        GUI["SHOW_TAG_BOX"] = not GUI["SHOW_TAG_BOX"]

    if key == KEY_BINDINGS["toggle_tag_id"]:
        GUI["SHOW_TAG_ID"] = not GUI["SHOW_TAG_ID"]

    if key == KEY_BINDINGS["toggle_world_coords"]:
        GUI["SHOW_TAG_WORLD_COORDS"] = not GUI["SHOW_TAG_WORLD_COORDS"]

    if key == KEY_BINDINGS["toggle_grid"]:
        GUI["SHOW_FLOOR_GRID"] = not GUI["SHOW_FLOOR_GRID"]

# ---------- MAIN ----------
def main():
    source = FrameSource()

    # ---------- STEP 1: Intrinsic Calibration ----------
    if os.path.exists(INTRINSIC_FILE):
        print("Intrinsic calibration found. Loading...")
        K, D = load_intrinsics()
    else:
        print("Starting intrinsic calibration.")
        print("Show checkerboard and move it around camera.")
        K, D = intrinsic_calibration(source)
        print("\nIntrinsic calibration complete!")
        print("Next step: Floor homography and AprilTag detection.")

    # ---------- STEP 2: Floor Calibration ----------
    calibrator = HomographyCalibrator(cam_name="floor_cam", K=K, D=D)
    H, points, ref_image_path = calibrator.load_homography()

    if H is None:
        print("\n--- Floor Calibration ---")
        print("Step 1: Mark interior points first (coordinates inside the floor).")
        print("Step 2: Mark boundary points for homography constraints.")
        print("Press ESC to cancel, 'c' to compute homography after marking points.\n")

        H, ref_image_path = calibrator.calibrate_floor(source)
        if H is not None:
            calibrator.save_homography()
            # Train ML model using image + marked points
            calibrator.train_coordinate_model()
        else:
            print("Floor calibration canceled.")
            return
    else:
        print("Loaded existing floor homography.")
        if ref_image_path and os.path.exists(ref_image_path):
            ref_image = cv2.imread(ref_image_path)
        # Train / load ML model for image-based prediction
        calibrator.train_coordinate_model()

    # ---------- STEP 3: AprilTag Detection + Extrinsic Tracking ----------
    detector = AprilTagDetector()
    scene = Scene3D()
    scene2d = TopViewScene(size_m=6)

    print("\nStarting AprilTag detection and multi-view tracking...")

    while True:
        frame = source.read()
        if frame is None or frame.size == 0:
            continue

        frame = undistort(frame, K, D)

        # --- AprilTag detection ---
        tags = detector.detect(frame)
        poses = compute_extrinsic(frame, tags, K, D)

        # --- Map tag floor points to world coordinates using image-aware ML ---
        tag_world_positions = []

        for tag in tags:

            foot_px = tag.corners[3]

            wx, wy = calibrator.pixel_to_world(foot_px[0], foot_px[1])

            tag_world_positions.append((tag.tag_id, wx, wy, 0))

            cx, cy = tag.center.astype(int)

            # Draw tag center
            if GUI["SHOW_TAG_CENTER"]:
                cv2.circle(frame, (cx,cy), 4, (0,0,255), -1)

            # Draw tag bounding box
            if GUI["SHOW_TAG_BOX"]:
                pts = tag.corners.astype(int)
                cv2.polylines(frame,[pts],True,(255,0,0),2)

            # Draw tag ID
            if GUI["SHOW_TAG_ID"]:
                cv2.putText(frame,
                            f"ID {tag.tag_id}",
                            (cx, cy-15),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.6,
                            (0,255,255),
                            2)

            # Draw world coordinates
            if GUI["SHOW_TAG_WORLD_COORDS"]:
                cv2.putText(frame,
                            f"{wx:.2f},{wy:.2f}",
                            (cx, cy + 25),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.55,
                            (0,0,255),
                            2)

        # --- Update 3D scene ---
        scene.update(poses, tag_world_positions)
        top_view = scene2d.render(tag_world_positions)
        cv2.imshow("Top View Map", top_view)

        # draw homography axes
        frame = calibrator.draw_axes(frame, axis_len=1.2)

        if GUI["SHOW_FLOOR_GRID"]:
            frame = calibrator.draw_grid(frame)

        # --- Display UI ---
        frame = draw_help_overlay(frame)
        cv2.imshow("Calibration", frame)

        key = cv2.waitKey(1)
        handle_gui_keys(key)
        if key == 27:  # ESC
            break

    source.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()