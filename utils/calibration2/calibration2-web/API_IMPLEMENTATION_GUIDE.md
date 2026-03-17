# Backend API Implementation Guide

## Overview

This guide describes the API endpoints required for the new multi-step calibration system.

---

## Endpoint Conventions

```
Base URL: /api
Authentication: (implement as needed)
Content-Type: application/json
Response Format:
{
  "success": boolean,
  "error": "string (if failed)",
  "data": { ... }
}
```

---

## Camera Feed Endpoints

### 1. GET /camera/[cameraId]/live-feed

**Purpose:** Get live feed stream URL for rendering

**Request:**
```json
{
  "cameraId": "string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "url": "rtsp://camera-ip:554/stream",
  "type": "rtsp|mjpeg|webrtc"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Camera offline"
}
```

**Implementation Notes:**
- Return current camera stream URL from config
- Validate camera exists
- Check camera is online/accessible

---

### 2. POST /camera/[cameraId]/snapshot

**Purpose:** Capture single frame as DataURL + save to disk

**Request:**
```json
{
  "cameraId": "string",
  "format": "jpeg|png" // optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "dataUrl": "data:image/jpeg;base64,...",
  "path": "/calibration/camera-1/snapshot-2026-03-17-12-34-56.jpg",
  "timestamp": "2026-03-17T12:34:56Z"
}
```

**Implementation Notes:**
- Capture frame from live stream
- Convert to base64 DataURL
- Save to disk in `cache/snapshots/`
- Return both base64 and file path
- Include timestamp for sync validation

---

## Step 1: Intrinsic Calibration Endpoints

### 3. POST /camera/[cameraId]/capture-intrinsic

**Purpose:** Capture checkerboard image for intrinsic calibration

**Request:**
```json
{
  "cameraId": "string",
  "checkerboard": "9x6",
  "squareSize": 0.024,
  "sessionId": "string (optional)"
}
```

**Response (Success):**
```json
{
  "success": true,
  "sample": {
    "image": "data:image/jpeg;base64,...",
    "path": "/calibration/camera-1/intrinsic/sample-001.jpg",
    "detected": true,
    "corners": [[x1,y1], [x2,y2], ...],
    "timestamp": "2026-03-17T12:34:56Z"
  },
  "sampleIndex": 1,
  "totalSamples": 8
}
```

**Implementation Notes:**
- Capture current frame from live feed
- Detect checkerboard using OpenCV
- Extract corner points via cv2.findChessboardCorners()
- Refine corners with cv2.cornerSubPix()
- Save image with detected corners overlaid
- Return corner coordinates for validation

---

### 4. POST /camera/[cameraId]/solve-intrinsic

**Purpose:** Calculate camera intrinsic parameters from samples

**Request:**
```json
{
  "cameraId": "string",
  "samples": [
    {
      "image": "data:image/jpeg;base64,...",
      "corners": [[x,y], ...],
      "checkerboard": "9x6",
      "squareSize": 0.024
    }
  ]
}
```

**Response (Success):**
```json
{
  "success": true,
  "result": {
    "cameraMatrix": [[fx, 0, cx], [0, fy, cy], [0, 0, 1]],
    "distortionCoefficients": [k1, k2, p1, p2, k3],
    "rmsReprojectionError": 0.35,
    "imageSize": [1920, 1080]
  },
  "outputPath": "/calibration/camera-1/intrinsics.npz",
  "summary": "Calibration RMS: 0.35px from 18 images"
}
```

**Implementation Notes:**
- Use cv2.calibrateCamera() with all samples
- Calculate camera matrix K and distortion D
- Save as NPZ file with:
  - `cameraMatrix`: 3×3 intrinsic matrix
  - `distortionCoeff`: 5-element distortion vector
  - `imageSize`: [width, height]
  - `rmsError`: reprojection error
- Return all calculated parameters

---

### 5. POST /camera/[cameraId]/generate-checkerboard

**Purpose:** Generate printable checkerboard PDF

**Request:**
```json
{
  "cameraId": "string",
  "checkerboard": "9x6",
  "squareSize": 0.024,
  "format": "A4|A3|custom"
}
```

**Response (Success):**
```json
{
  "success": true,
  "downloadUrl": "/api/download?path=/calibration/checkerboards/9x6-0.024m-A4.pdf",
  "filename": "checkerboard-9x6-24mm.pdf",
  "size": "210x297mm"
}
```

---

## Step 2: Plane Mapping Endpoints (NEW)

### 6. POST /camera/[cameraId]/detect-human-pose

**Purpose:** Detect human pose and estimate ground plane

**Request:**
```json
{
  "cameraId": "string",
  "imageDataUrl": "data:image/jpeg;base64,..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "keypoints": [
    {
      "id": 0,
      "name": "nose",
      "x": 456.2,
      "y": 123.5,
      "confidence": 0.95
    },
    {
      "id": 15,
      "name": "left_ankle",
      "x": 400.1,
      "y": 520.3,
      "confidence": 0.87
    },
    {
      "id": 16,
      "name": "right_ankle",
      "x": 520.5,
      "y": 519.8,
      "confidence": 0.89
    }
  ],
  "groundPlaneEstimate": {
    "y": 520,
    "normal": [0, 1, 0],
    "confidence": 0.88
  },
  "personBox": [350, 80, 580, 530]
}
```

**Implementation Notes:**
- Use YOLOv8-Pose (pytorch/onnx)
- Model: yolov8n-pose.pt (~6.3MB)
- Outputs 17 keypoints (COCO format)
- Extract foot keypoints (ankle: id 15, 16)
- Calculate ground Y-coordinate from ankle positions
- Estimate plane normal [0, 1, 0] (vertical)
- Include confidence scores for filtering

---

### 7. POST /camera/[cameraId]/segment-planes

**Purpose:** Detect planar surfaces via instance segmentation

**Request:**
```json
{
  "cameraId": "string",
  "imageDataUrl": "data:image/jpeg;base64,..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "planes": [
    {
      "id": 0,
      "mask": "base64-encoded-binary-mask",
      "maskSize": [1920, 1080],
      "area": 450000,
      "center": [600, 800],
      "normal": [0, 0.98, 0.2],
      "confidence": 0.92,
      "label": "ground"
    },
    {
      "id": 1,
      "mask": "base64-encoded-binary-mask",
      "maskSize": [1920, 1080],
      "area": 120000,
      "center": [1200, 400],
      "normal": [0, 0.1, 0.99],
      "confidence": 0.85,
      "label": "wall"
    }
  ]
}
```

**Implementation Notes:**
- Use YOLOv8-Seg (segmentation model)
- Detect instance masks for each plane
- Calculate plane geometry (normal, area, center)
- Prioritize ground plane (normal ≈ [0, 1, 0])
- Return top 5 planes by confidence
- Encode masks as RLE or base64 binary

---

### 8. POST /camera/[cameraId]/spread-ground-plane

**Purpose:** Extend ground plane detection to edges via edge detection

**Request:**
```json
{
  "cameraId": "string",
  "imageDataUrl": "data:image/jpeg;base64,...",
  "poseGroundPlane": {
    "y": 520,
    "normal": [0, 1, 0],
    "confidence": 0.88
  },
  "seedPoints": [[400, 520], [520, 520]]
}
```

**Response (Success):**
```json
{
  "success": true,
  "mappedPoints": [
    {
      "x": 350,
      "y": 520,
      "z": 0.0,
      "source": "edge_detected",
      "confidence": 0.82
    },
    {
      "x": 600,
      "y": 520,
      "z": 0.0,
      "source": "interpolated",
      "confidence": 0.75
    }
  ],
  "groundMask": "base64-encoded-mask"
}
```

**Implementation Notes:**
- Apply Canny edge detection to image
- Find horizontal edges near pose-detected ground plane
- Use flood fill / region growing from seed points
- Interpolate ground plane to edges
- Assign Z=0 to all ground points
- Return all detected ground coordinates

---

## Step 3: Ground Plane Calibration Endpoints

### 9. POST /camera/[cameraId]/auto-detect-ground

**Purpose:** Automatically detect ground plane landmarks

**Request:**
```json
{
  "cameraId": "string",
  "imageDataUrl": "data:image/jpeg;base64,...",
  "groundPlaneHint": {
    "y": 520,
    "normal": [0, 1, 0]
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "detections": [
    {
      "x": 450,
      "y": 520,
      "confidence": 0.93,
      "type": "corner",
      "description": "Room corner"
    },
    {
      "x": 800,
      "y": 520,
      "confidence": 0.87,
      "type": "edge",
      "description": "Wall-ground junction"
    }
  ],
  "featureCount": 12,
  "imageSize": [1920, 1080]
}
```

**Implementation Notes:**
- Use ORB or LoFTR feature detector
- Focus on ground plane region (near hint Y coordinate)
- Extract distinctive corners and edges
- Include feature descriptors for matching
- Sort by confidence (highest first)

---

### 10. POST /api/match-features-multiview

**Purpose:** Match features across multiple camera views

**Request:**
```json
{
  "cameraId": "string",
  "frames": [
    {
      "cameraId": "cam-1",
      "cameraName": "Camera 1",
      "imageDataUrl": "data:image/jpeg;base64,...",
      "features": [{"x": 100, "y": 200, "desc": "..."}],
      "timestamp": "2026-03-17T12:34:56Z"
    },
    {
      "cameraId": "cam-2",
      "cameraName": "Camera 2",
      "imageDataUrl": "data:image/jpeg;base64,...",
      "features": [{"x": 150, "y": 210, "desc": "..."}],
      "timestamp": "2026-03-17T12:34:56.1Z"
    }
  ]
}
```

**Response (Success):**
```json
{
  "success": true,
  "matches": [
    {
      "camera1": "cam-1",
      "camera2": "cam-2",
      "point1": [100, 200],
      "point2": [150, 210],
      "matchScore": 0.94,
      "type": "loftr|orb"
    },
    {
      "camera1": "cam-1",
      "camera2": "cam-2",
      "point1": [500, 450],
      "point2": [480, 470],
      "matchScore": 0.87,
      "type": "loftr"
    }
  ],
  "totalMatches": 23,
  "avgScore": 0.89
}
```

**Implementation Notes:**
- Use LoFTR (recommended) or ORB for feature matching
- Extract features from all frames
- Match between each camera pair
- Return confidence scores for each match
- Support temporal consistency checks
- Prefer matches with high confidence (>0.7)

---

## Download Endpoints

### 11. GET /api/download

**Purpose:** Download file by path

**Request:**
```
GET /api/download?path=/calibration/camera-1/intrinsics.npz
```

**Response:**
- File contents with appropriate headers
- Content-Type: application/octet-stream or application/pdf
- Content-Disposition: attachment; filename="..."

---

## Error Handling

All endpoints should return consistent error format:

```json
{
  "success": false,
  "error": "Descriptive error message",
  "code": "CAMERA_OFFLINE|NOT_FOUND|PROCESSING_FAILED|VALIDATION_ERROR"
}
```

**Common Error Codes:**
- `CAMERA_OFFLINE` - Camera not accessible
- `NOT_FOUND` - Camera/resource doesn't exist
- `INVALID_PARAM` - Invalid input parameters
- `PROCESSING_FAILED` - Backend processing error
- `MODEL_NOT_FOUND` - ML model not available
- `INSUFFICIENT_DATA` - Not enough samples/features

---

## Performance Expectations

| Endpoint | Latency | Notes |
|----------|---------|-------|
| live-feed | <100ms | Return URL, not stream |
| snapshot | 500-1500ms | Capture + encode to base64 |
| capture-intrinsic | 1-2s | Detect checkerboard corners |
| solve-intrinsic | 5-10s | OpenCV calibration with 18+ samples |
| detect-human-pose | 200-500ms | YOLOv8-Pose inference |
| segment-planes | 300-800ms | YOLOv8-Seg inference |
| spread-ground-plane | 500-1500ms | Edge detection + flood fill |
| auto-detect-ground | 300-600ms | ORB/LoFTR feature extraction |
| match-features-multiview | 1-3s | Cross-camera feature matching |

---

## Implementation Priority

**Phase 1 (Essential):**
1. Camera feed & snapshot endpoints
2. Intrinsic calibration (capture + solve)
3. Auto-detect ground

**Phase 2 (High Priority):**
4. Human pose detection
5. Plane segmentation
6. Multi-camera matching

**Phase 3 (Nice-to-Have):**
7. Spread ground plane
8. Generate checkerboard PDF
9. Advanced visualizations

---

## Testing

Create unit tests for each endpoint:

```python
def test_capture_intrinsic():
    response = client.post(
        "/api/camera/cam-1/capture-intrinsic",
        json={"checkerboard": "9x6", "squareSize": 0.024}
    )
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert "sample" in response.json()

def test_solve_intrinsic():
    response = client.post(
        "/api/camera/cam-1/solve-intrinsic",
        json={"samples": [...]}
    )
    assert response.status_code == 200
    assert "cameraMatrix" in response.json()["result"]
```

---

## Dependencies

**Python Packages:**
```
opencv-python>=4.8.0
numpy>=1.24.0
ultralytics>=8.0.0  # YOLOv8
torch>=2.0.0
kornia>=0.7.0  # LoFTR
```

**Models to Download:**
```
yolov8n-pose.pt        (6.3 MB)
yolov8n-seg.pt         (8.1 MB)
loftr_indoor.ckpt      (200 MB) - optional
```

---

## Documentation Links

- [OpenCV Camera Calibration](https://docs.opencv.org/master/dc/dbb/tutorial_py_calibration.html)
- [YOLOv8 Pose Detection](https://docs.ultralytics.com/tasks/pose/)
- [YOLOv8 Instance Segmentation](https://docs.ultralytics.com/tasks/segment/)
- [LoFTR Feature Matching](https://zju3dv.github.io/loftr/)
- [ORB Feature Detector](https://opencv-python-tutroals.readthedocs.io/en/latest/source/py_tutorials/py_feature2d/py_orb/py_orb.html)
