# homography.py
import cv2
import numpy as np
import yaml
import os
import datetime
import pickle
from config import GUI
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

class HomographyCalibrator:
    def __init__(self, cam_name="cam", patch_size=32, K=None, D=None):
        self.cam_name = cam_name
        self.image_points = []   # (x,y) pixels
        self.world_points = []   # (X,Y) world coords
        self.ref_image = None    # reference image for ML
        self.patch_size = patch_size

        # camera intrinsics
        self.K = K
        self.D = D

        self.HOMOGRAPHY_DIR = "homographies"
        self.REFERENCE_DIR = "floor_reference_images"
        self.MODEL_DIR = "floor_models"

        os.makedirs(self.HOMOGRAPHY_DIR, exist_ok=True)
        os.makedirs(self.REFERENCE_DIR, exist_ok=True)
        os.makedirs(self.MODEL_DIR, exist_ok=True)

        self.H = None
        self.H_base = None   # original calibration homography

        self.model = None
        self.scaler = None

        # ORB reference features
        self.ref_kp = None
        self.ref_des = None

        # Mouse callback flag
        self._cv_callback_set = False
        self.boundary_points = []
        self.boundary_distances = []
    
    def undistort_point(self, x, y):

        if self.K is None or self.D is None:
            return x, y

        pts = np.array([[[x, y]]], dtype=np.float32)

        und = cv2.undistortPoints(
            pts,
            self.K,
            self.D,
            P=self.K
        )

        return float(und[0][0][0]), float(und[0][0][1])

    # -----------------------------
    # Mouse callback for clicks
    # -----------------------------
    def _click_event(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            print(f"Pixel selected: ({x}, {y})")
            try:
                wx = float(input("Enter world X (meters): "))
                wy = float(input("Enter world Y (meters): "))
            except ValueError:
                print("Invalid input, try again")
                return
            self.image_points.append([x, y])
            self.world_points.append([wx, wy])

    # -----------------------------
    # Normalize points (DLT)
    # -----------------------------
    @staticmethod
    def _normalize_points(pts):
        pts = np.array(pts, dtype=np.float64)
        mean = np.mean(pts, axis=0)
        pts_centered = pts - mean
        d = np.mean(np.linalg.norm(pts_centered, axis=1))

        if d < 1e-8:
            scale = 1.0
        else:
            scale = np.sqrt(2) / d
        T = np.array([[scale,0,-scale*mean[0]],
                      [0,scale,-scale*mean[1]],
                      [0,0,1]])
        pts_norm = (T @ np.vstack((pts.T, np.ones(pts.shape[0])))).T
        return pts_norm[:, :2], T

    # -----------------------------
    # Deterministic DLT homography
    # -----------------------------
    def compute_homography_dlt(self):
        image_pts = np.array(self.image_points, dtype=np.float64)
        world_pts = np.array(self.world_points, dtype=np.float64)

        img_norm, T_img = self._normalize_points(image_pts)
        world_norm, T_world = self._normalize_points(world_pts)

        N = len(image_pts)
        A = []
        for i in range(N):
            x, y = img_norm[i]
            X, Y = world_norm[i]
            A.append([-x, -y, -1, 0, 0, 0, x*X, y*X, X])
            A.append([0, 0, 0, -x, -y, -1, x*Y, y*Y, Y])
        A = np.array(A, dtype=np.float64)

        U, S, Vt = np.linalg.svd(A)
        H_norm = Vt[-1].reshape(3,3)
        H = np.linalg.inv(T_world) @ H_norm @ T_img
        H /= H[2,2]
        self.H = H
        self.H_base = H.copy()
        return H

    def refine_scale_using_boundaries(self):

        if self.H is None:
            return

        if len(self.boundary_points) < 2:
            return

        scales = []

        for i in range(len(self.boundary_distances)):

            p1 = self.boundary_points[i]
            p2 = self.boundary_points[i+1]

            d_real = self.boundary_distances[i]

            w1 = self.pixel_to_world(p1[0], p1[1])
            w2 = self.pixel_to_world(p2[0], p2[1])

            if w1 is None or w2 is None:
                continue

            d_est = np.linalg.norm(np.array(w1) - np.array(w2))

            if d_est > 0:
                scales.append(d_real / d_est)

        if len(scales) == 0:
            return

        scale = np.mean(scales)

        S = np.array([
            [scale,0,0],
            [0,scale,0],
            [0,0,1]
        ])

        self.H = S @ self.H

        print(f"Homography scale refined using boundaries (scale={scale:.4f})")

    # -----------------------------
    # Calibrate floor
    # -----------------------------
    def calibrate_floor(self, source):

        cv2.namedWindow("Floor Calibration", cv2.WINDOW_NORMAL)

        clicked_points = []

        stage = {"step": 0}

        def click(event, x, y, flags, param):
            if event != cv2.EVENT_LBUTTONDOWN:
                return

            if stage["step"] == 0:
                print("Origin selected.")
                self.image_points.append([x,y])
                self.world_points.append([0.0,0.0])
                clicked_points.append((x,y))
                stage["step"] = 1

            elif stage["step"] == 1:
                print("X-axis point selected (1.2,0).")
                self.image_points.append([x,y])
                self.world_points.append([1.2,0.0])
                clicked_points.append((x,y))
                stage["step"] = 2

            elif stage["step"] == 2:
                print("Y-axis point selected (0,1.2).")
                self.image_points.append([x,y])
                self.world_points.append([0.0,1.2])
                clicked_points.append((x,y))
                stage["step"] = 3

            elif stage["step"] == 3:
                print("Point (1.2,1.2) selected.")
                self.image_points.append([x,y])
                self.world_points.append([1.2,1.2])
                clicked_points.append((x,y))
                stage["step"] = 4
                print("\nNow mark boundary points.")

            elif stage["step"] == 4:

                self.boundary_points.append((x,y))
                print(f"Boundary Point BP{len(self.boundary_points)} selected")

                if len(self.boundary_points) > 1:
                    while True:
                        try:
                            d = float(input(
                                f"Distance between BP{len(self.boundary_points)-1} and BP{len(self.boundary_points)} (meters): "
                            ))
                            self.boundary_distances.append(d)
                            break
                        except:
                            print("Invalid distance.")

            elif stage["step"] == 5:
                print("Interior point selected")

                while True:
                    try:
                        wx = float(input("World X: "))
                        wy = float(input("World Y: "))
                        self.image_points.append([x,y])
                        self.world_points.append([wx,wy])
                        break
                    except:
                        print("Invalid input")

        cv2.setMouseCallback("Floor Calibration", click)

        print("\n--- Floor Calibration ---")
        print("1. Click ORIGIN (0,0)")
        print("2. Click X-axis point (1,0)")
        print("3. Click Y-axis point (0,1)")
        print("4. Click (1,1)")
        print("5. Click boundary points")
        print("Press 'b' when boundary marking finished")
        print("Press 'i' to mark interior points")
        print("Press 'c' to compute homography")
        print("ESC to cancel\n")

        while True:

            frame = source.read()
            if frame is None:
                continue

            display = frame.copy()

            # draw clicked points
            for p in clicked_points:
                cv2.circle(display, p, 5, (0,255,0), -1)

            # draw axes
            if len(clicked_points) >= 2:
                cv2.line(display, clicked_points[0], clicked_points[1], (255,0,0), 2)

            if len(clicked_points) >= 3:
                cv2.line(display, clicked_points[0], clicked_points[2], (0,0,255), 2)

            # draw boundary polygon
            if len(self.boundary_points) > 1:
                for i in range(len(self.boundary_points)-1):
                    cv2.line(display, self.boundary_points[i], self.boundary_points[i+1], (0,255,255), 2)

            cv2.imshow("Floor Calibration", display)

            key = cv2.waitKey(1) & 0xFF

            if key == ord("b"):
                print("Boundary marking finished.")
                stage["step"] = 5

            if key == ord("c"):

                if len(self.image_points) < 4:
                    print("Not enough points.")
                    continue

                break

            if key == 27:
                return None, None

        self.ref_image = frame.copy()

        self.ref_image_path = os.path.join(
            self.REFERENCE_DIR,
            f"{self.cam_name}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        )

        cv2.imwrite(self.ref_image_path, self.ref_image)

        # Precompute ORB features for reference image
        orb = cv2.ORB_create(2000)
        self.ref_kp, self.ref_des = orb.detectAndCompute(self.ref_image, None)

        self.compute_homography_dlt()
        self.refine_scale_using_boundaries()

        print("Homography computed successfully")

        return self.H, self.ref_image_path
    
    def correct_for_camera_shift(self, frame):

        if self.ref_image is None or self.H_base is None:
            return

        # Ensure reference features exist
        if self.ref_kp is None or self.ref_des is None:
            orb = cv2.ORB_create(2000)
            self.ref_kp, self.ref_des = orb.detectAndCompute(self.ref_image, None)

        orb = cv2.ORB_create(2000)
        kp2, des2 = orb.detectAndCompute(frame, None)

        if des2 is None:
            return

        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

        matches = bf.match(self.ref_des, des2)

        if len(matches) < 20:
            return

        # keep best matches
        matches = sorted(matches, key=lambda x: x.distance)
        matches = matches[:200]

        src = np.float32([self.ref_kp[m.queryIdx].pt for m in matches])
        dst = np.float32([kp2[m.trainIdx].pt for m in matches])

        H_motion, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5)

        if H_motion is None:
            return

        # Apply motion relative to base homography (NO DRIFT)
        self.H = H_motion @ self.H_base

    # -----------------------------
    # Save / Load homography + points
    # -----------------------------
    def save_homography(self):
        if self.H is None or self.ref_image_path is None:
            print("Nothing to save")
            return
        filename = os.path.join(self.HOMOGRAPHY_DIR, f"{self.cam_name}_homography.yaml")
        points_data = [
            {"pixel": [int(p[0]), int(p[1])], "world": [float(w[0]), float(w[1])]}
            for p,w in zip(self.image_points, self.world_points)
        ]
        data = {
            "H": self.H.tolist(),
            "points": points_data,
            "reference_image": self.ref_image_path,
            "timestamp": datetime.datetime.now().isoformat()
        }
        with open(filename, "w") as f:
            yaml.dump(data, f)
        print(f"Homography saved to {filename}")

    def load_homography(self):
        filename = os.path.join(self.HOMOGRAPHY_DIR, f"{self.cam_name}_homography.yaml")
        if not os.path.exists(filename):
            return None, None, None
        with open(filename, "r") as f:
            data = yaml.safe_load(f)
        self.H = np.array(data["H"], dtype=np.float64)
        self.H_base = self.H.copy()
        self.image_points = [p["pixel"] for p in data.get("points",[])]
        self.world_points = [p["world"] for p in data.get("points",[])]
        self.ref_image_path = data.get("reference_image", None)
        if self.ref_image_path and os.path.exists(self.ref_image_path):
            self.ref_image = cv2.imread(self.ref_image_path)
            orb = cv2.ORB_create(2000)
            self.ref_kp, self.ref_des = orb.detectAndCompute(self.ref_image, None)
        return self.H, self.image_points, self.ref_image_path

    # -----------------------------
    # Pixel ↔ World
    # -----------------------------
    def pixel_to_world(self, x, y):

        if self.H is None:
            return None

        x, y = self.undistort_point(x, y)

        p = np.array([x, y, 1.0], dtype=np.float64)

        world = self.H @ p
        world /= world[2]

        return float(world[0]), float(world[1])

    def world_to_pixel(self, X, Y):

        if self.H is None:
            return None

        p = np.array([X, Y, 1.0], dtype=np.float64)

        img = np.linalg.inv(self.H) @ p
        img /= img[2]

        return float(img[0]), float(img[1])

    # -----------------------------
    # Image-aware ML model
    # -----------------------------
    def train_coordinate_model(self):
        if len(self.image_points) < 6 or self.ref_image is None:
            print("Not enough points or reference image missing for ML training")
            return

        patches = []
        for (x,y) in self.image_points:
            patch = self._extract_patch(x,y)
            patches.append(patch.flatten())
        X = np.array(patches)
        y = np.array(self.world_points)

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        self.model = MLPRegressor(hidden_layer_sizes=(128,128), max_iter=1500)
        self.model.fit(X_scaled, y)

        with open(os.path.join(self.MODEL_DIR, "coord_model.pkl"), "wb") as f:
            pickle.dump({"model": self.model, "scaler": self.scaler}, f)
        print("Image-based coordinate regression model trained and saved!")

    def predict_world_ml(self, x, y):
        if self.model is None or self.scaler is None:
            model_path = os.path.join(self.MODEL_DIR, "coord_model.pkl")
            if not os.path.exists(model_path):
                return None
            with open(model_path,"rb") as f:
                data = pickle.load(f)
                self.model = data["model"]
                self.scaler = data["scaler"]

        patch = self._extract_patch(x,y).flatten()
        X_scaled = self.scaler.transform([patch])
        return self.model.predict(X_scaled)[0]

    # -----------------------------
    # Helper: extract image patch
    # -----------------------------
    def _extract_patch(self, x, y):
        half = self.patch_size // 2
        img = self.ref_image
        h, w = img.shape[:2]

        x = int(round(x))
        y = int(round(y))

        x1 = max(0, x - half)
        y1 = max(0, y - half)
        x2 = min(w, x + half)
        y2 = min(h, y + half)

        patch = img[y1:y2, x1:x2]
        # Resize to fixed size
        patch = cv2.resize(patch, (self.patch_size, self.patch_size))
        patch = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
        return patch.astype(np.float32)/255.0
    
    # -----------------------------
    # Draw homography origin + axes
    # -----------------------------
    def draw_axes(self, frame, axis_len=1.0):
        if self.H is None:
            return frame

        # world coordinates
        origin = (0,0)
        x_axis = (axis_len,0)
        y_axis = (0,axis_len)

        p0 = self.world_to_pixel(*origin)
        px = self.world_to_pixel(*x_axis)
        py = self.world_to_pixel(*y_axis)

        if p0 is None or px is None or py is None:
            return frame

        p0 = tuple(map(int,p0))
        px = tuple(map(int,px))
        py = tuple(map(int,py))

        # draw origin
        if GUI["SHOW_HOMOGRAPHY_ORIGIN"]:
            cv2.circle(frame,p0,6,(0,255,255),-1)

        if GUI["SHOW_HOMOGRAPHY_AXES"]:
            cv2.line(frame,p0,px,(0,0,255),3)
            cv2.line(frame,p0,py,(0,255,0),3)

        if GUI["SHOW_HOMOGRAPHY_ORIGIN"]:
            cv2.putText(frame,"Origin",(p0[0]+5,p0[1]-5), cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,255,255),2)
        if GUI["SHOW_HOMOGRAPHY_AXES"]:
            cv2.putText(frame,"X",(px[0]+5,px[1]), cv2.FONT_HERSHEY_SIMPLEX,0.6,(0,0,255),2)
            cv2.putText(frame,"Y",(py[0]+5,py[1]), cv2.FONT_HERSHEY_SIMPLEX,0.6,(0,255,0),2)

        return frame

    def draw_grid(self, frame, size=6, step=0.5):

        if self.H is None:
            return frame

        h, w = frame.shape[:2]
        samples = 50

        xs = np.arange(-size, size + step, step)
        ys = np.arange(-size, size + step, step)

        # ---- Vertical lines (constant X) ----
        for x in xs:

            pts = []

            for y in np.linspace(-size, size, samples):

                p = self.world_to_pixel(x, y)

                if p is None:
                    continue

                px, py = int(p[0]), int(p[1])

                # clip to image
                if 0 <= px < w and 0 <= py < h:
                    pts.append((px, py))

            if len(pts) > 1:
                cv2.polylines(frame, [np.array(pts)], False, (100,100,100), 1)

        # ---- Horizontal lines (constant Y) ----
        for y in ys:

            pts = []

            for x in np.linspace(-size, size, samples):

                p = self.world_to_pixel(x, y)

                if p is None:
                    continue

                px, py = int(p[0]), int(p[1])

                if 0 <= px < w and 0 <= py < h:
                    pts.append((px, py))

            if len(pts) > 1:
                cv2.polylines(frame, [np.array(pts)], False, (100,100,100), 1)

        return frame