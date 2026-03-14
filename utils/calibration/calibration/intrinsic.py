import cv2
import numpy as np
import time
from config import *
from storage.calibration_io import save_intrinsics

REQUIRED_SAMPLES = 25
CAPTURE_DELAY = 1.0

def intrinsic_calibration(source):

    cv2.namedWindow("Intrinsic Calibration", cv2.WINDOW_NORMAL)

    objp = np.zeros((CHECKERBOARD[0]*CHECKERBOARD[1],1,3), np.float32)
    objp[:,:,:2] = np.mgrid[
        0:CHECKERBOARD[0],
        0:CHECKERBOARD[1]
    ].T.reshape(-1,1,2)
    objp *= SQUARE_SIZE

    objpoints = []
    imgpoints = []

    last_capture_time = 0

    K = None
    D = None
    reprojection_error = None

    status = "Searching checkerboard..."

    print("Move checkerboard across different angles")

    while True:

        frame = source.read()
        if frame is None:
            continue

        display = frame.copy()

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        ret, corners = cv2.findChessboardCorners(gray, CHECKERBOARD)

        if ret:

            status = "Checkerboard detected"

            corners = cv2.cornerSubPix(
                gray,
                corners,
                (11,11),
                (-1,-1),
                (
                    cv2.TERM_CRITERIA_EPS +
                    cv2.TERM_CRITERIA_MAX_ITER,
                    30,
                    0.1
                )
            )

            cv2.drawChessboardCorners(display, CHECKERBOARD, corners, ret)

            now = time.time()

            if now - last_capture_time > CAPTURE_DELAY and len(objpoints) < REQUIRED_SAMPLES:

                objpoints.append(objp)
                imgpoints.append(corners)

                last_capture_time = now

                print(f"Captured {len(objpoints)}/{REQUIRED_SAMPLES}")

        else:
            status = "Searching checkerboard..."

        captured = len(objpoints)
        remaining = REQUIRED_SAMPLES - captured

        # --------------------------------------------------
        # Run calibration once all samples collected
        # --------------------------------------------------

        if captured == REQUIRED_SAMPLES and K is None:

            status = "Computing calibration..."

            print("Computing intrinsic calibration...")

            if USE_FISHEYE:

                K = np.zeros((3,3))
                D = np.zeros((4,1))

                rms, _, _, _, _ = cv2.fisheye.calibrate(
                    objpoints,
                    imgpoints,
                    (WIDTH,HEIGHT),
                    K,
                    D,
                    None,
                    None,
                    flags=cv2.fisheye.CALIB_RECOMPUTE_EXTRINSIC |
                        cv2.fisheye.CALIB_CHECK_COND |
                        cv2.fisheye.CALIB_FIX_SKEW
                )

                reprojection_error = rms

            else:

                rms, K, D, _, _ = cv2.calibrateCamera(
                    objpoints,
                    imgpoints,
                    (WIDTH,HEIGHT),
                    None,
                    None
                )

                reprojection_error = rms

            save_intrinsics(K,D)

            print("Intrinsic calibration saved")

            status = "Calibration Complete"

        # --------------------------------------------------
        # Display info
        # --------------------------------------------------

        cv2.putText(display,f"Captured: {captured}",(20,40),
                    cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,0),2)

        cv2.putText(display,f"Remaining: {remaining}",(20,80),
                    cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,255),2)

        cv2.putText(display,status,(20,120),
                    cv2.FONT_HERSHEY_SIMPLEX,0.8,(255,255,255),2)

        # Show calibration results once available
        if K is not None:

            fx = K[0,0]
            fy = K[1,1]
            cx = K[0,2]
            cy = K[1,2]

            cv2.putText(display,f"fx: {fx:.1f}  fy: {fy:.1f}",(20,180),
                        cv2.FONT_HERSHEY_SIMPLEX,0.7,(200,200,200),2)

            cv2.putText(display,f"cx: {cx:.1f}  cy: {cy:.1f}",(20,210),
                        cv2.FONT_HERSHEY_SIMPLEX,0.7,(200,200,200),2)

            cv2.putText(display,f"Reproj Error: {reprojection_error:.4f}",(20,240),
                        cv2.FONT_HERSHEY_SIMPLEX,0.7,(0,200,255),2)

        cv2.imshow("Intrinsic Calibration", display)

        key = cv2.waitKey(1)

        if key == ord("q"):
            break

    return K,D