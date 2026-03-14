# Calibration2 (3D DWG-assisted)

This module provides a new calibration sequence using a **3D DWG CAD model**.

## What it does

1. Intrinsic calibration (checkerboard capture) or reuse existing intrinsics.
2. Load CAD geometry from a DWG file (`LINE`, `LWPOLYLINE`, `POLYLINE`) with XYZ support.
3. Manual correspondence picking:
   - rotate CAD in `CAD Select`
   - click CAD vertices in `CAD Select`
   - click matching pixels in `Image Select`
4. Solve full camera pose using `solvePnP` (3D CAD world -> image).
5. Save calibration output and run live CAD overlay on camera stream.

## Run

From `prometheus/utils/calibration2`:

```bash
python main.py --dwg /path/to/plan.dwg --source 0
```

Useful options:

- `--source`: webcam index, RTSP URL, or video file path.
- `--force-intrinsic`: recompute intrinsics even if output exists.
- `--checkerboard 9x6` and `--square-size 0.024`.
- `--output-dir ./output`.
- `--display-scale 0.65`: lower display size for faster rendering.
- `--max-fps 24`: cap live overlay FPS for smoother responsiveness.

For slower machines/streams, try:

```bash
python main.py --dwg /path/to/model.dwg --source <camera_or_video> --display-scale 0.5 --max-fps 15
```

## Controls

### Intrinsic capture
- `SPACE`: capture sample (only when checkerboard is detected)
- `C`: run calibration once enough samples are captured
- `Q`: cancel

### Correspondence selection
- Left-click in `CAD Select`: pick nearest visible 3D CAD vertex
- Left-click in `Image Select`: assign pixel for the most recently selected CAD vertex
- `I/K`: pitch
- `J/L`: yaw
- `U/O`: roll
- `+/-`: zoom
- `F/H/G/T`: pan CAD view
- `R`: reset view
- `S`: solve pose (needs >=4 matched pairs and equal counts)
- `Z`: undo
- `C`: clear all
- `Q`: cancel

### Live overlay
- `Q`: quit

## Output files

- `output/intrinsics.npz`
- `output/calibration2.yaml`

The YAML stores 3D pose fields:
- `pose.rvec`
- `pose.tvec`
- `pose.reproj_rmse_px`
