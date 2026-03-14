import cv2
import numpy as np


def parse_checkerboard(spec: str):
    parts = spec.lower().split("x")
    if len(parts) != 2:
        raise ValueError("Checkerboard spec must be like '9x6'")
    return int(parts[0]), int(parts[1])


def calibrate_intrinsics(source, checkerboard=(9, 6), square_size=0.024, min_samples=20):
    w, h = checkerboard

    objp = np.zeros((w * h, 3), np.float32)
    objp[:, :2] = np.mgrid[0:w, 0:h].T.reshape(-1, 2)
    objp *= float(square_size)

    obj_points = []
    img_points = []

    cv2.namedWindow("Intrinsic Capture", cv2.WINDOW_NORMAL)

    while True:
        frame = source.read()
        if frame is None:
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        found, corners = cv2.findChessboardCorners(gray, (w, h), None)

        vis = frame.copy()

        msg = f"Samples: {len(obj_points)}/{min_samples} | SPACE=capture | C=calibrate | Q=quit"
        cv2.putText(vis, msg, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

        if found:
            cv2.drawChessboardCorners(vis, (w, h), corners, found)

        cv2.imshow("Intrinsic Capture", vis)
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            raise RuntimeError("Intrinsic calibration cancelled by user")

        if key == ord(" ") and found:
            refined = cv2.cornerSubPix(
                gray,
                corners,
                (11, 11),
                (-1, -1),
                (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001),
            )
            obj_points.append(objp.copy())
            img_points.append(refined)

        if key == ord("c"):
            if len(obj_points) < min_samples:
                print(f"Need at least {min_samples} samples, have {len(obj_points)}")
                continue

            ret, K, D, _, _ = cv2.calibrateCamera(
                obj_points,
                img_points,
                gray.shape[::-1],
                None,
                None,
            )

            print(f"[Intrinsic] RMS reprojection error: {ret:.4f}")
            cv2.destroyWindow("Intrinsic Capture")
            return K, D, float(ret)


def load_intrinsics(npz_path):
    data = np.load(npz_path)
    return data["K"], data["D"], float(data.get("rms", np.array(0.0)))


def save_intrinsics(npz_path, K, D, rms=0.0):
    np.savez(npz_path, K=K, D=D, rms=np.array([rms], dtype=np.float32))
