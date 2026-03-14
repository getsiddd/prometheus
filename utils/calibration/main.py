# main.py
import cv2
import os
import numpy as np

from camera.frame_source import FrameSource
from calibration.intrinsic import intrinsic_calibration
from calibration.undistort import undistort
from calibration.extrinsic import compute_extrinsic
from calibration.homography import HomographyCalibrator
from calibration.quality import CalibrationQualityReporter
from calibration.stability import WorldCoordinateStabilizer
from calibration.cad_alignment import CADModelAligner
from calibration.sfm_refinement import SfMRefiner
from calibration.ui_controller import CalibrationUIController

from detection.apriltag_detector import AprilTagDetector

from visualization.scene3d import Scene3D
from visualization.topview import TopViewScene

from storage.calibration_io import load_intrinsics
from config import *

# ---------- MAIN ----------
def main():
    source = FrameSource()
    ui_controller = CalibrationUIController(GUI, KEY_BINDINGS)

    quality_reporter = CalibrationQualityReporter()
    stabilizer = WorldCoordinateStabilizer(
        alpha=CALIBRATION_PIPELINE["stabilizer_alpha"],
        history=CALIBRATION_PIPELINE["stabilizer_history"],
        max_jump_m=CALIBRATION_PIPELINE["stabilizer_max_jump_m"]
    )

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

    sfm_report = {"ok": False, "message": "SfM not executed"}

    if CALIBRATION_PIPELINE.get("enable_sfm_refinement", True):
        sfm_refiner = SfMRefiner(
            max_frames=CALIBRATION_PIPELINE["sfm_max_frames"],
            frame_stride=CALIBRATION_PIPELINE["sfm_frame_stride"],
            min_inliers=CALIBRATION_PIPELINE["sfm_min_inliers"],
            resize_width=CALIBRATION_PIPELINE["sfm_resize_width"]
        )

        print("Running SfM multi-view analysis from feed...")
        sfm_report = sfm_refiner.analyze(source, K)
        print("SfM result:", sfm_report.get("message", "done"))
    else:
        sfm_refiner = SfMRefiner()

    if CALIBRATION_PIPELINE.get("enable_cad_alignment", True):
        cad_aligner = CADModelAligner(
            alignment_file=CALIBRATION_PIPELINE["cad_alignment_file"]
        )

        if cad_aligner.load():
            cad_pose = cad_aligner.estimate_pose(K, D)

            if cad_pose.get("ok", False):
                H_cad = cad_aligner.floor_homography_from_pose(
                    K,
                    cad_pose["rvec"],
                    cad_pose["tvec"]
                )

                if H_cad is not None:
                    calibrator.set_homography(H_cad)
                    print(
                        "CAD alignment applied | "
                        f"inliers={cad_pose['inliers']} | "
                        f"reproj_rmse={cad_pose['reproj_rmse_px']:.2f}px"
                    )
            else:
                print("CAD alignment skipped:", cad_pose.get("message", "unknown"))
        else:
            print(
                "CAD alignment file not found or invalid: "
                f"{CALIBRATION_PIPELINE['cad_alignment_file']}"
            )

    quality_report = quality_reporter.evaluate_homography(calibrator)
    print("Calibration quality:", quality_report)

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

        if CALIBRATION_PIPELINE.get("enable_camera_shift_correction", True):
            calibrator.correct_for_camera_shift(frame)

        # --- AprilTag detection ---
        tags = detector.detect(frame)
        poses = compute_extrinsic(frame, tags, K, D)

        # --- Map tag floor points to world coordinates using image-aware ML ---
        tag_world_positions = []
        active_tag_ids = []

        for tag in tags:

            foot_px = tag.corners[3]

            world = calibrator.pixel_to_world(foot_px[0], foot_px[1])

            if world is None:
                continue

            wx, wy = world

            if CALIBRATION_PIPELINE.get("enable_world_stabilizer", True):
                wx, wy, wz = stabilizer.update(tag.tag_id, wx, wy, 0.0)
            else:
                wz = 0.0

            active_tag_ids.append(tag.tag_id)

            tag_world_positions.append((tag.tag_id, wx, wy, wz))

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
        if CALIBRATION_PIPELINE.get("enable_world_stabilizer", True):
            stabilizer.decay_unseen(active_tag_ids)

        scene.update(poses, tag_world_positions)
        top_view = scene2d.render(tag_world_positions)
        cv2.imshow("Top View Map", top_view)

        # draw homography axes
        frame = calibrator.draw_axes(frame, axis_len=1.2)

        if GUI["SHOW_FLOOR_GRID"]:
            frame = calibrator.draw_grid(frame)

        # --- Display UI ---
        frame = ui_controller.draw_help_overlay(
            frame,
            quality_lines=quality_reporter.to_overlay_lines(quality_report),
            sfm_lines=sfm_refiner.to_overlay_lines(sfm_report)
        )
        cv2.imshow("Calibration", frame)

        key = cv2.waitKey(1)
        ui_controller.handle_key(key)
        if key == 27:  # ESC
            break

    source.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()