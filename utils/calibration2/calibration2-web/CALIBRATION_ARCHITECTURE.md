# Multi-Step Calibration Architecture

## Overview

The calibration system has been refactored into **separate pages for each calibration process**, with centralized state management via `CalibrationContext`.

## New Structure

```
/src/app/camera/[cameraId]/
├── layout.js              # Wraps with CalibrationProvider
├── page.js                # Step chooser / intro
├── intrinsic/
│   └── page.js           # Step 1: Intrinsic Calibration
├── plane-mapping/
│   └── page.js           # Step 2: Plane Mapping (Z-coords + Human Pose)
└── ground-plane/
    └── page.js           # Step 3: Ground Plane Calibration
```

## Calibration Workflow

### Step 1: Intrinsic Calibration
**Route:** `/camera/[cameraId]/intrinsic`

**Purpose:** Calibrate camera lens distortion and intrinsic parameters

**Features:**
- Checkerboard pattern capture (8-12 images minimum)
- OpenCV camera matrix calculation
- Distortion coefficient estimation
- Intrinsic parameters saved to `.npz` file

**Output:** `calibration/intrinsics.npz` containing:
- Camera matrix (K)
- Distortion coefficients (D)
- RMS reprojection error

---

### Step 2: Plane Mapping with Z-Coordinates
**Route:** `/camera/[cameraId]/plane-mapping`

**Purpose:** Map real-world ground plane with Z-direction coordinates

**Features:**
- **Human Pose Detection (YOLOv8-Pose):** Automatically detects person standing in frame
  - Model: YOLOv8-Pose nano/small (6-40 MB, ultra-lightweight)
  - Output: 17-point COCO keypoints (nose, eyes, ears, shoulders, elbows, wrists, hips, knees, ankles)
  - Confidence filtering: excludes keypoints < 0.7 confidence
  - **Ground plane estimation:** Calculates Y-coordinate from ankle positions
  - **Advantage over MediaPipe:** Faster, more accurate, better multi-person support
  
- **Instance Segmentation (YOLOv8-Seg):** Detects planar surfaces in scene
  - Separate detection for each distinct plane
  - Ground plane prioritization
  - Outputs: Pixel-level masks + plane geometry
  
- **Z-Coordinate Assignment:** Map real-world heights to detected planes
  - Set Z=0 at ground level
  - Define intermediate elevations (0.5m, 1.0m, 1.5m, etc.)
  - Auto-spread ground plane detection to edges using edge detection
  - Stores per-plane Z-mappings with confidence

**Workflow:**
1. Capture frame and run YOLOv8-Pose → extract 17 keypoints
2. Calculate ground plane from foot keypoints (ankles 15, 16)
3. Run YOLOv8-Seg → detect plane masks and geometry
4. Manually assign Z-coordinates to detected planes
5. Auto-spread ground plane from feet to scene edges

**Output:** Plane-to-Z-coordinate mappings with:
- Plane IDs and segmentation masks
- Z-coordinates (real-world meters)
- Ground plane equation (normal vector + distance)
- Confidence scores per mapping

---

### Step 3: Ground Plane Calibration
**Route:** `/camera/[cameraId]/ground-plane`

**Purpose:** Match image coordinates to AutoCAD real-world coordinates

**Features:**
- **No human pose estimation** (moved to Step 2)
- **Auto ground detection:** Extract ground plane landmarks
- **Multi-camera sync:** 
  - Capture simultaneous snapshots from all project cameras
  - Feature matching across camera views
  - Robust correspondence tracking
- **Image ↔ World coordinate mapping:**
  - Manually place markers on image
  - Assign real-world (X,Y) coordinates from AutoCAD
  - Calculate homography transform

**Workflow:**
1. Auto-detect ground plane points in current camera
2. For other cameras: capture synced snapshots
3. Match features across all synced frames
4. Place image markers and assign world coordinates
5. Solve homography for current camera
6. Transfer correspondences to other cameras

**Output:** 
- Homography matrix + ground plane equation
- Image-to-world coordinate transforms per camera

---

## State Management

### CalibrationContext (`/src/lib/CalibrationContext.js`)

Provides centralized state for:

**Camera & Project:**
- `activeProjectCameraId` - Currently calibrating camera
- `projectCameras` - List of all project cameras
- `cameraWorkspaces` - Per-camera calibration state

**Feed:**
- `feedEnabled` - Live feed active
- `liveFeedSrc` - Stream URL
- `snapshotDataUrl` - Last captured frame

**Intrinsic:**
- `intrinsicSamples` - Captured checkerboard images
- `intrinsicsPath` - Output `.npz` path
- `intrinsicSolveResult` - Camera matrix and distortion

**Plane Mapping:**
- `correspondences` - Mapped planes with Z-coordinates
- `humanPoseDetections` - Detected keypoints from pose model
- `poseGroundPlaneEstimate` - Estimated ground plane equation

**Ground Plane:**
- `validationPairs` - Cross-camera feature matches
- `syncedMatchFrames` - Synced snapshots from all cameras
- `liveKeypointsDebug` - Feature extraction diagnostics

**Multi-Camera Sync:**
- `syncedMatchFrames[{cameraId, snapshotDataUrl, ...}]`
- `syncedFrameIndex` - Preview rotator position

### Usage in Pages

```javascript
import { useCalibration } from "@/lib/CalibrationContext";

export default function MyPage() {
  const {
    activeProjectCameraId,
    correspondences,
    setCorrespondences,
    stageOutputs,
    setStageOutput,
    // ... all other state
  } = useCalibration();

  // Use state and setters freely
}
```

---

## API Endpoints

Expected backend endpoints (to implement):

```
POST  /api/camera/[cameraId]/live-feed
      → Returns { success, src, url }

POST  /api/camera/[cameraId]/capture-intrinsic
      → Returns { success, sample, sampleIndex }

POST  /api/camera/[cameraId]/solve-intrinsic
      → Returns { success, result, outputPath }

POST  /api/camera/[cameraId]/detect-human-pose
      → Returns { success, keypoints[], groundPlaneEstimate }

POST  /api/camera/[cameraId]/segment-planes
      → Returns { success, planes[], selectedPlaneId }

POST  /api/camera/[cameraId]/spread-ground-plane
      → Returns { success, mappedPoints[] }

POST  /api/camera/[cameraId]/auto-detect-ground
      → Returns { success, detections[] }

POST  /api/camera/[cameraId]/snapshot
      → Returns { success, dataUrl, path }

POST  /api/match-features-multiview
      → Returns { success, matches[] }
```

---

## Navigation Flow

```
Project Entry
    ↓
/camera/[cameraId]                    ← Choose step
    ├→ /intrinsic                     ← Step 1
    │    ↓ (on complete)
    ├→ /plane-mapping                 ← Step 2
    │    ↓ (on complete)
    └→ /ground-plane                  ← Step 3
         ↓ (on complete)
    → Verification/Export
```

---

## Key Differences from Old Architecture

| Aspect | Old | New |
|--------|-----|-----|
| **Layout** | Single monolithic page | Separate pages per step |
| **State** | Local component state | Centralized context |
| **Navigation** | Conditional rendering | URL-based routing |
| **Scope** | All steps together | Focused single step |
| **Human Pose** | In Ground Plane step | In Plane Mapping step |
| **Z-Coords** | Separate step | Integrated into Plane Mapping |
| **Multi-Camera** | Limited sync | Full synced coverage in Ground Plane |

---

## Migration Guide

For existing calibration workflows:

1. **Old URL:** `/calibration?project=...&camera=...`
   **New URL:** `/camera/[cameraId]`

2. **State:** Previously passed as props → Now via `useCalibration()`

3. **Sections:** Components still work, but now receive state from context instead of props

4. **API calls:** Same endpoints, but context state handles persistence

---

## Implementation Checklist

**Completed:** ✅
- [x] Create CalibrationContext with full state
- [x] Create camera route layout + provider
- [x] Implement intro/step chooser page
- [x] Extract Step 1: Intrinsic Calibration
- [x] Create Step 2: Plane Mapping (with human pose)
- [x] Extract Step 3: Ground Plane (with multi-camera sync)

**Pending:** (Priority Order)
- [ ] Implement backend API endpoints
- [ ] Add error handling & loading states
- [ ] Add step completion validation
- [ ] Create step-to-step navigation guards
- [ ] Add calibration result export
- [ ] Add result visualization

---

## Next Steps

### 1. **Implement backend API endpoints** for:
   - **Human Pose Detection (YOLOv8-Pose)**
     - Endpoint: `POST /api/camera/[cameraId]/detect-human-pose`
     - Model: YOLOv8-Pose (ultra-lightweight version)
     - Output: 17-point COCO keypoints + ground plane estimate
     - Latency: 200-500ms
   
   - **Instance Segmentation (YOLOv8-Seg)**
     - Endpoint: `POST /api/camera/[cameraId]/segment-planes`
     - Model: YOLOv8-Seg (plane detection)
     - Output: Per-plane masks + geometry (normal, center, area)
     - Latency: 300-800ms
   
   - **Ground Plane Detection (ORB/LoFTR)**
     - Endpoint: `POST /api/camera/[cameraId]/auto-detect-ground`
     - Primary: LoFTR (deep learning, more robust)
     - Fallback: ORB (traditional, lightweight)
     - Output: Ground landmarks + feature descriptors
     - Latency: 300-600ms
   
   - **Multi-View Feature Matching**
     - Endpoint: `POST /api/match-features-multiview`
     - Matches LoFTR/ORB features across camera views
     - Output: Correspondence pairs + match scores
     - Latency: 1-3s (parallel processing)

### 2. **Add validation** for:
   - **Minimum samples per step:**
     - Intrinsic: 18+ checkerboard images
     - Plane Mapping: Min 2 planes, ground plane required
     - Ground Plane: Min 4 correspondence pairs
   
   - **Feature quality thresholds:**
     - ORB feature match score: > 0.7
     - LoFTR match confidence: > 0.8
     - Pose keypoint confidence: > 0.7
   
   - **Cross-camera sync timing:**
     - Snapshots captured within 100ms window
     - Timestamp drift validation
     - Sync failure recovery

### 3. **Create result export** with:
   - **Calibration matrices per camera:**
     - Camera intrinsic matrix (K) 3×3
     - Distortion coefficients (D) 5-element
     - Homography matrix (H) 3×3
   
   - **Ground plane equations:**
     - Plane normal vector (Nx, Ny, Nz)
     - Plane distance (D)
     - Coordinate frame definition
   
   - **Z-coordinate mappings:**
     - Plane ID → Z-coordinate (meters)
     - Confidence scores per mapping
     - Coverage percentage
   
   - **Homography transforms:**
     - Image-to-world 3×3 matrix
     - World-to-image (inverse) matrix
     - Reprojection error metrics
   
   - **Export formats:**
     - NPZ (NumPy): Raw matrices
     - JSON: Human-readable format
     - YAML: Config file format
     - CSV: Spreadsheet export

### 4. **Add visualization** for:
   - **Projected world axes on images:**
     - X-axis (red), Y-axis (green), Z-axis (blue)
     - Origin marker at calibrated ground point
     - Scaling based on real-world distance
   
   - **Multi-camera coverage heatmap:**
     - Coverage percentage per image region
     - Overlap zones highlighted
     - Gap zones indicated
   
   - **Pose keypoints and ground plane overlay:**
     - 17-point pose skeleton overlay (cyan)
     - Ground contact points (yellow circles)
     - Ground plane line/polygon (magenta)
     - Confidence scores as opacity levels
