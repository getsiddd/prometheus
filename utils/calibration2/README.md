# Calibration2 — Advanced Real-World Camera Calibration (3D CAD + Vision)

Calibration2 is an advanced calibration pipeline for mapping camera pixels to real-world coordinates using 3D CAD geometry and vision measurements.

It is designed for CCTV/RTSP/webcam deployments where you need:

- camera intrinsic calibration,
- camera pose recovery in a CAD/world frame,
- stable image-to-world coordinate conversion,
- geometry-aware CAD overlay,
- and a web/headless operation path for production workflows.

## 2-minute quick start

Use this when you want to verify the full pipeline quickly.

1. Install dependencies:

   **macOS**

   ```bash
   python3 -m pip install opencv-python numpy pyyaml ezdxf reportlab
   brew install ffmpeg colmap
   ```

   **Ubuntu**

   ```bash
   sudo apt update
   sudo apt install -y python3 python3-pip ffmpeg colmap
   python3 -m pip install opencv-python numpy pyyaml ezdxf reportlab
   ```

2. Go to the module folder:

   ```bash
   cd prometheus/utils/calibration2
   ```

3. Run with provided sample CAD and your camera (or a file path):

   ```bash
   python main.py --dwg ./samples/simple_floor_3d.dwg --source 0 --output-dir ./output
   ```

4. In the UI flow:
   - Capture intrinsic samples (`SPACE`) and solve (`C`) if needed.
   - Capture reference frame.
   - Pick CAD↔image correspondences (minimum 4 pairs).
   - Solve (`S`) and verify live overlay.

5. Check outputs:
   - `./output/intrinsics.npz`
   - `./output/calibration2.yaml`

If your machine is slower, add:

```bash
--display-scale 0.5 --max-fps 15
```

## What this module does

1. Solves or reuses camera intrinsics from checkerboard images.
2. Loads 3D CAD geometry from DWG/DXF content (`LINE`, `LWPOLYLINE`, `POLYLINE`) with XYZ support.
3. Collects CAD ↔ image correspondences via interactive point picking.
4. Solves camera pose with `solvePnPRansac` (fallback to `solvePnP`).
5. Computes reprojection RMSE and inlier count.
6. Saves calibration artifacts (`intrinsics.npz`, `calibration2.yaml`).
7. Runs live CAD projection overlay on camera frames.
8. Converts mouse pixel to world coordinate on `z=0` plane during live view.
9. Supports browser-driven/headless operations (snapshot, intrinsic detect/solve, PnP solve, checkerboard PDF).
10. Supports SfM stage execution with COLMAP from uploaded image sets.

## Key components

- `main.py`: full interactive desktop calibration flow.
- `intrinsic.py`: checkerboard capture and intrinsic solve.
- `cad_dwg.py`: DWG/DXF geometry loading, 3D preview rendering, nearest-vertex snapping.
- `camera_source.py`: camera/file stream abstraction.
- `web_backend.py`: headless Python commands used by web APIs.
- `web_backend_services/`: class-based backend modules split by responsibility (`SnapshotService`, `PnPCalibrationService`, `IntrinsicCalibrationService`, `MappingValidationService`, `MultiViewTriangulationService`, `WebCalibrationBackend`).
- `calibration2-web/`: Next.js UI + API layer for browser workflows.

## End-to-end pipeline (interactive desktop)

1. **Intrinsic stage**
   - Capture checkerboard samples.
   - Run camera intrinsic calibration (`K`, `D`).
2. **CAD ingest**
   - Load 3D CAD line geometry and vertex set.
3. **Correspondence stage**
   - Select CAD 3D points and matching image pixels.
4. **Extrinsic solve (PnP)**
   - Estimate camera pose (`rvec`, `tvec`) in CAD/world frame.
5. **Validation + export**
   - Compute reprojection RMSE and save YAML/NPZ outputs.
6. **Live overlay + world query**
   - Render projected CAD on frames.
   - Show pixel-to-world (plane `z=0`) for mouse pointer.

## Install prerequisites

### Python packages

Install these in your active environment:

**macOS**

```bash
python3 -m pip install opencv-python numpy pyyaml ezdxf reportlab
```

**Ubuntu**

```bash
python3 -m pip install opencv-python numpy pyyaml ezdxf reportlab
```

### System tools (web features)

- `ffmpeg` + `ffprobe` for browser MJPEG feed proxy.
- `colmap` for SfM stage.

macOS:

```bash
brew install ffmpeg colmap
```

Ubuntu:

```bash
sudo apt update
sudo apt install -y ffmpeg colmap
```

## Run interactive desktop calibration

From `prometheus/utils/calibration2`:

```bash
python main.py --dwg /path/to/model.dwg --source 0
```

Common options:

- `--source`: webcam index, RTSP URL, or video file path.
- `--force-intrinsic`: recompute intrinsics even if existing output is present.
- `--checkerboard 9x6`
- `--square-size 0.024`
- `--min-samples 18`
- `--output-dir ./output`
- `--display-scale 0.65`
- `--max-fps 24`

For slower devices/streams:

```bash
python main.py --dwg /path/to/model.dwg --source <camera_or_video> --display-scale 0.5 --max-fps 15
```

## Keyboard/mouse controls

### Intrinsic capture window

- `SPACE`: capture sample (when checkerboard is found)
- `C`: solve intrinsics (after enough samples)
- `Q`: cancel

### CAD/Image correspondence windows

- Left click in **CAD Select**: choose nearest visible CAD vertex
- Left click in **Image Select**: assign pixel for selected CAD point
- `I/K`: pitch
- `J/L`: yaw
- `U/O`: roll
- `+/-`: zoom
- `F/H/G/T`: pan
- `R`: reset 3D view
- `S`: solve pose (requires at least 4 valid pairs)
- `Z`: undo
- `C`: clear all pairs
- `Q`: cancel

### Live overlay window

- `Q`: quit

## Output artifacts

Default output directory: `./output`

- `intrinsics.npz`
  - `K`: camera matrix
  - `D`: distortion coefficients
  - `rms`: intrinsic calibration RMS
- `calibration2.yaml`
  - `timestamp`
  - `dwg_path`
  - `mode`
  - `intrinsic.K`, `intrinsic.D`
  - `pose.rvec`, `pose.tvec`, `pose.reproj_rmse_px`, `pose.inliers`
  - full `correspondences` list (world XYZ + pixel UV)

## Web mode (Next.js)

UI location: `utils/calibration2/calibration2-web`

```bash
cd utils/calibration2/calibration2-web
npm install
npm run dev
```

Open: `http://localhost:3000`

Optional environment variable:

- `CALIBRATION_PYTHON=/path/to/python`

The web module provides:

- browser feed for RTSP/file via MJPEG proxy,
- webcam capture,
- intrinsic sample capture and solve,
- headless PnP solve from correspondences,
- live validation of pixel↔world mapping using known test points,
- project create/save/open for multi-camera calibration projects (no manual JSON authoring required),
- per-camera sequential solve pipeline across all project cameras,
- shared marker reuse between cameras,
- multi-view triangulation from shared marker observations,
- auto feature-based marker generation for triangulation (LoFTR deep matcher, with ORB fallback),
- checkerboard PDF generation,
- DWG/DXF upload preview,
- one-click sequential execution of all calibration stages (combined sequence),
- SfM stage with COLMAP.

## Multi-camera project config (web)

You can create a project JSON directly from the web dashboard, save progress, and reopen later to continue from where you stopped.

Project rules in web mode:

- one shared DWG/DXF path is used as source of truth across all cameras,
- project metadata (name + description) is stored,
- per-camera calibration workspace state is stored for resume (snapshots, correspondences, stage outputs, etc).

You can still upload an existing project JSON for compatibility.

Example:

```json
{
   "projectName": "warehouse-zone-a",
   "projectDescription": "Zone A entrance and loading bay calibration",
   "sharedDwgPath": "/path/to/zone_a_shared.dwg",
   "sharedDwgFileName": "zone_a_shared.dwg",
   "cameras": [
      {
         "id": "cam-gate",
         "name": "Gate Camera",
         "location": "Gate",
         "cameraType": "cctv",
         "sourceMode": "rtsp",
         "sourceUrl": "rtsp://<camera-1>",
         "intrinsicsPath": "/path/to/cam_gate_intrinsics.npz",
         "checkerboard": "9x6",
         "squareSize": 0.024,
         "minSamples": 18
      },
      {
         "id": "cam-loading",
         "name": "Loading Bay Camera",
         "location": "Loading Bay",
         "cameraType": "cctv",
         "sourceMode": "rtsp",
         "sourceUrl": "rtsp://<camera-2>",
         "intrinsicsPath": "/path/to/cam_loading_intrinsics.npz"
      }
   ],
   "sharedMarkers": [
      {
         "id": "m1",
         "world": [0.0, 0.0, 0.0],
         "observations": {
            "cam-gate": [812.0, 515.0]
         }
      }
   ],
   "cameraWorkspaces": {
      "cam-gate": {
         "snapshotPath": "/path/to/snapshots/cam-gate.jpg",
         "latestCalibrationYamlPath": "/path/to/calibration/cam-gate.yaml"
      }
   }
}
```

Recommended sequence:

1. Use `/project` page to create project or open existing one.
2. Open `/project/<projectId>` to view camera list and per-camera DONE/FAIL status.
3. Click `Go to calibration` for a camera (`/project/<projectId>/camera/<cameraId>`).
4. Complete stages for that camera, then use `Go back to list of cameras` or `Go to next camera`.
5. Save current camera progress from calibration page when needed.
6. Continue remaining cameras until all statuses are green.
7. Run multi-view triangulation (or enable auto triangulation in project sequence).
   - If shared markers are empty but snapshots are available for solved cameras, triangulation can auto-match features across views.

Optional deep-matching dependencies (for best auto-match quality):

```bash
python3 -m pip install torch kornia
```

## Accuracy recommendations

- Use at least 8–20 CAD-image correspondences (not just 4).
- Distribute points across full image area (corners + center).
- Include geometry at varied depths when possible (not all coplanar).
- Use physically correct checkerboard square size.
- Keep CAD units consistent with intended world units.
- Prefer sharp frames and avoid motion blur.

## Coordinate and depth notes

- Pixel-to-world conversion in live view is currently solved on plane `z=0`.
- Z-direction support exists via 3D CAD correspondences and dedicated z-mapping stage in web flow.
- This module currently provides sparse geometry/depth grounding, not dense per-pixel depth maps.

## Current limitations

- Correspondence picking is manual.
- No global bundle adjustment across all stages yet.
- Web lightweight preview parser reads ASCII DXF-like `LINE` entities only.
- Real DWG extraction quality depends on CAD source format and parser support.

## Troubleshooting

- **Cannot open source**: verify camera index/RTSP URL/file path.
- **No checkerboard detected**: improve lighting, angle, and board visibility.
- **`ezdxf` missing**: install with `pip install ezdxf`.
- **PDF generation fails**: install `reportlab` and ensure board size fits A3 margins.
- **SfM fails**: confirm `colmap` is installed and at least 4 valid images are uploaded.
- **Deep auto-matching unavailable**: install `torch` + `kornia` for LoFTR; otherwise ORB fallback is used.

## Vision

Calibration2 is intended as an advanced real-world calibration stack for robust image-to-world mapping, CAD-aligned localization, and depth-aware scene understanding in production camera systems.
