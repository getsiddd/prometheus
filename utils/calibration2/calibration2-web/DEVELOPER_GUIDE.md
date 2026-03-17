# Calibration System Developer Guide

Complete reference for developers implementing calibration steps and features.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Using the Calibration Context](#using-the-calibration-context)
4. [API Integration](#api-integration)
5. [Custom Hooks](#custom-hooks)
6. [Error Handling](#error-handling)
7. [Validation](#validation)
8. [Navigation & Routing](#navigation--routing)
9. [Export & Visualization](#export--visualization)
10. [Testing & Mocking](#testing--mocking)
11. [Configuration](#configuration)
12. [Common Patterns](#common-patterns)

---

## Architecture Overview

### Layered Architecture

```
UI Components (pages/)
        ↓
Custom Hooks (hooks/)
        ↓
Service Layer (lib/apiService.js)
        ↓
Backend API (Node.js/Python)
```

### State Management

Central state is managed by `CalibrationContext`:
- 30+ state variables organized by step
- Provides hooks: `useCalibrationState()`, `useUpdateCalibration()`
- Persists to localStorage automatically

### Key Libraries

| Library | Purpose | Location |
|---------|---------|----------|
| apiService | HTTP client with retry | `/src/lib/apiService.js` |
| errorHandler | Error categorization | `/src/lib/errorHandler.js` |
| validationRules | Step validation | `/src/lib/validationRules.js` |
| navigationGuards | Route protection | `/src/lib/navigationGuards.js` |
| exportUtils | Result export | `/src/lib/exportUtils.js` |
| visualizationUtils | Canvas rendering | `/src/lib/visualizationUtils.js` |
| useCalibration | Custom hooks | `/src/hooks/useCalibration.js` |
| calibrationConfig | Constants & config | `/src/config/calibrationConfig.js` |
| testingUtils | Mocks & fixtures | `/src/lib/testingUtils.js` |

---

## Project Structure

```
src/
├── app/
│   └── camera/[cameraId]/
│       ├── layout.js                 # Wraps with CalibrationProvider
│       ├── page.js                   # Step selector
│       ├── intrinsic/
│       │   └── page.js               # Step 1
│       ├── plane-mapping/
│       │   └── page.js               # Step 2
│       └── ground-plane/
│           └── page.js               # Step 3
├── components/calibration/
│   ├── ErrorBoundary.js              # Error catching
│   └── LoadingStates.js              # UI components
├── lib/
│   ├── apiService.js                 # HTTP client
│   ├── errorHandler.js               # Error management
│   ├── validationRules.js            # Validation logic
│   ├── navigationGuards.js           # Route protection
│   ├── exportUtils.js                # Export formats
│   ├── visualizationUtils.js         # Canvas/SVG rendering
│   └── testingUtils.js               # Mocks & fixtures
├── hooks/
│   └── useCalibration.js             # Custom hooks
├── context/
│   └── CalibrationContext.js         # Global state
└── config/
    └── calibrationConfig.js          # Constants & config
```

---

## Using the Calibration Context

### Accessing State

```javascript
import { useCalibrationState, useUpdateCalibration } from "@/context/CalibrationContext";

export function MyComponent() {
  // Read state
  const { intrinsic, planeMapping, groundPlane } = useCalibrationState();
  
  // Update state
  const { setIntrinsicSamples, setIntrinsicResult } = useUpdateCalibration();
  
  return (
    <div>
      {intrinsic.samples.length} samples captured
    </div>
  );
}
```

### State Structure

```javascript
{
  // Intrinsic calibration
  intrinsic: {
    samples: [],              // Captured checkerboard images
    solved: false,            // Whether intrinsic was solved
    result: null,             // CameraMatrix, DistortionCoefficients
    solving: false,           // Is solving in progress?
    error: null,              // Error from solver
  },
  
  // Plane mapping
  planeMapping: {
    planes: [],               // Detected planes with equations
    zMappings: [],            // Z-coordinate mappings
    humanPose: null,          // Detected human pose
    detecting: false,         // Is detection running?
    error: null,              // Detection error
  },
  
  // Ground plane
  groundPlane: {
    result: null,             // Ground plane equation + correspondences
    syncedCameras: [],        // Multi-camera sync data
    computing: false,         // Is computation running?
    error: null,              // Computation error
  },
  
  // UI state
  currentStep: "intrinsic",
  selectedCameraId: "front",
  isLoading: false,
  notification: null,
}
```

### Updating State

```javascript
const { setIntrinsicSamples, setIntrinsicResult, setPlaneMapping } = useUpdateCalibration();

// Add a sample
setIntrinsicSamples([...samples, newSample]);

// Set solved result
setIntrinsicResult({
  cameraMatrix: [...],
  distortionCoefficients: [...]
});
```

---

## API Integration

### Making API Calls

```javascript
import { apiService } from "@/lib/apiService";

// Intrinsic calibration
const sample = await apiService.captureIntrinsicSample("front");
const result = await apiService.solveIntrinsic("front", sampleIds);

// Plane mapping
const pose = await apiService.detectHumanPose("front", imageUrl);
const planes = await apiService.segmentPlanes("front", imageUrl, pose);

// Ground plane
const ground = await apiService.autoDetectGround("front");
const correspondences = await apiService.matchFeaturesMultiView("front", referenceId, imageUrl);

// Multi-camera
const snapshots = await apiService.syncSnapshots(["front", "side"]);
```

### Error Handling

API calls already include:
- Exponential backoff retry (3 attempts)
- 60-second timeout
- Standardized error wrapping
- Network offline detection

```javascript
try {
  const result = await apiService.solveIntrinsic("front", sampleIds);
} catch (error) {
  console.error(error.code);      // "TIMEOUT" | "NETWORK_ERROR" | etc.
  console.error(error.message);   // User-friendly message
  console.error(error.details);   // Technical details
}
```

---

## Custom Hooks

### useAsync

Manage async operations with loading/error states:

```javascript
import { useAsync } from "@/hooks/useCalibration";

const { execute, status, data, error, notification } = useAsync(
  (cameraId) => apiService.captureIntrinsicSample(cameraId),
  false  // immediate = false (don't execute on mount)
);

// Trigger the operation
const result = await execute("front");

// Check status
if (status === "pending") return <LoadingSpinner />;
if (status === "error") return <ErrorCard error={error} />;
if (status === "success") return <SuccessCard data={data} />;
```

### useDebouncedValue

Debounce state updates:

```javascript
import { useDebouncedValue } from "@/hooks/useCalibration";

const [searchTerm, setSearchTerm] = useState("");
const debouncedTerm = useDebouncedValue(searchTerm, 500);

useEffect(() => {
  // Runs only when debouncedTerm changes (500ms after last keystroke)
  performSearch(debouncedTerm);
}, [debouncedTerm]);
```

### useValidation

Manage form validation:

```javascript
import { useValidation } from "@/hooks/useCalibration";

const { errors, setFieldError, hasErrors } = useValidation({
  email: null,
  password: null,
});

const handleChange = (e) => {
  const { name, value } = e.target;
  if (!value) {
    setFieldError(name, "Required");
  } else {
    setFieldError(name, null);
  }
};
```

### useStepProgress

Track progress through multi-step process:

```javascript
import { useStepProgress } from "@/hooks/useCalibration";

const {
  currentStep,
  progress,        // 0-100%
  nextStep,
  previousStep,
  completeStep,
  isStepCompleted,
} = useStepProgress(3);  // 3 steps total

// Track step completion
completeStep(0);  // Mark step 0 as complete

// Navigate
nextStep();  // Move to step 1
previousStep();  // Back to step 0
```

### useForm

Manage form state and submission:

```javascript
import { useForm } from "@/hooks/useCalibration";

const { values, handleChange, handleSubmit, submitting } = useForm(
  { email: "", password: "" },
  async (values) => {
    await apiService.saveCalibration(cameraId, values);
  }
);

return (
  <form onSubmit={handleSubmit}>
    <input name="email" value={values.email} onChange={handleChange} />
    <button type="submit" disabled={submitting}>
      {submitting ? "Saving..." : "Save"}
    </button>
  </form>
);
```

### useClipboard

Copy text to clipboard:

```javascript
import { useClipboard } from "@/hooks/useCalibration";

const { copied, copy } = useClipboard(2000);  // 2-second feedback

return (
  <button onClick={() => copy(JSON.stringify(data))}>
    {copied ? "Copied!" : "Copy"}
  </button>
);
```

---

## Error Handling

### Error Types

9 categorized error types:

```javascript
import { ERROR_TYPES, getErrorMessage, getRecoveryStrategy } from "@/lib/errorHandler";

// CAMERA_OFFLINE, NOT_FOUND, INVALID_PARAM, PROCESSING_FAILED, 
// MODEL_NOT_FOUND, INSUFFICIENT_DATA, NETWORK_ERROR, TIMEOUT, VALIDATION_ERROR

const errorMsg = getErrorMessage(ERROR_TYPES.CAMERA_OFFLINE);
// "Camera is offline. Please check the connection."

const strategy = getRecoveryStrategy(ERROR_TYPES.TIMEOUT);
// "RETRY" | "USER_ACTION" | "CONTACT_SUPPORT" | "SKIP_STEP"
```

### Custom Error Class

```javascript
import { CalibrationError } from "@/lib/errorHandler";

const error = new CalibrationError(
  "PROCESSING_FAILED",
  "Image processing failed",
  { details: "..." }
);

console.log(error.toJSON());
// { code: "PROCESSING_FAILED", message: "...", details: {...} }
```

### Display Errors

```javascript
import { ErrorCard } from "@/components/calibration/LoadingStates";

<ErrorCard 
  error={error}
  onRetry={() => location.reload()}
  onDismiss={() => setError(null)}
/>
```

---

## Validation

### Step-by-Step Validation

```javascript
import { validateIntrinsicStep, validatePlaneMappingStep, getCalibrationReadiness } from "@/lib/validationRules";

// Validate intrinsic step
const validation = validateIntrinsicStep(intrinsicState);
console.log(validation);
// {
//   valid: false,
//   errors: ["Need at least 18 samples"],
//   warnings: ["Some samples have low quality"],
//   completionPercentage: 28
// }

// Check if can proceed
if (!validation.valid) {
  // Show blockers to user
  validation.errors.forEach(error => showMessage(error, "error"));
}

// Get overall readiness
const readiness = getCalibrationReadiness(calibrationState);
// { overall: false, intrinsic: true, planeMapping: false, groundPlane: false }
```

### Pre-Submission Validation

```javascript
const handleSave = async () => {
  const validation = validateIntrinsicStep(intrinsic);
  
  if (!validation.valid) {
    showErrorNotification(validation.errors[0]);
    return;
  }
  
  // Proceed with save
  await apiService.solveIntrinsic(cameraId, sampleIds);
};
```

---

## Navigation & Routing

### Route Guards

```javascript
import { navigationGuards } from "@/lib/navigationGuards";
import { useRouter } from "next/navigation";

const router = useRouter();
const { canAccessStep, canProceedToStep } = navigationGuards;

// Check if can access a step
if (!canAccessStep("ground-plane", state)) {
  showWarning("Complete plane mapping first");
  router.push(`/camera/${cameraId}/plane-mapping`);
}

// Get blocking message
const blockingMsg = getStepBlockingMessage("ground-plane", state);
// "Ground plane requires intrinsic and plane mapping to be complete"
```

### Breadcrumbs

```javascript
import { getBreadcrumbs } from "@/lib/navigationGuards";

const breadcrumbs = getBreadcrumbs(currentStep, state);
// [
//   { label: "Intrinsic", step: "intrinsic", completed: true, active: false },
//   { label: "Plane Mapping", step: "plane-mapping", completed: false, active: true },
//   { label: "Ground Plane", step: "ground-plane", completed: false, active: false }
// ]

return (
  <div>
    {breadcrumbs.map((item) => (
      <span key={item.step} className={item.active ? "active" : ""}>
        {item.completed && "✓ "}
        {item.label}
      </span>
    ))}
  </div>
);
```

---

## Export & Visualization

### Export Results

```javascript
import { exportAsJSON, exportAsYAML, downloadFile, createCalibrationPackage } from "@/lib/exportUtils";

// Export as JSON
const json = exportAsJSON(calibrationState);
downloadFile(json, "calibration.json", "application/json");

// Export as YAML
const yaml = exportAsYAML(calibrationState);
downloadFile(yaml, "calibration.yaml", "application/x-yaml");

// Create multi-format package
const package = createCalibrationPackage(calibrationState, ["json", "yaml", "csv"]);
// Contains all three formats
```

### Visualization Overlays

```javascript
import { drawWorldAxes, drawPoseKeypoints, drawCoverageHeatmap } from "@/lib/visualizationUtils";

const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

// Draw axes overlay
drawWorldAxes(ctx, canvas.width, canvas.height, cameraMatrix, pose);

// Draw skeleton
drawPoseKeypoints(ctx, humanPose.keypoints);

// Draw coverage
drawCoverageHeatmap(ctx, correspondences);
```

---

## Testing & Mocking

### Use Mock API in Development

```javascript
import { MockAPIClient } from "@/lib/testingUtils";

// In development environment
const apiClient = process.env.NODE_ENV === "development"
  ? new MockAPIClient(1000)  // 1-second fake delay
  : apiService;

// Use as normal
const sample = await apiClient.captureIntrinsicSample("front");
```

### Generate Mock State

```javascript
import { generateMockCalibrationState } from "@/lib/testingUtils";

const mockState = generateMockCalibrationState("front");
// Full calibration state with realistic mock data
```

### Simulate Errors

```javascript
import { simulateNetworkError } from "@/lib/testingUtils";

throw simulateNetworkError("timeout");  // Request timeout
throw simulateNetworkError("offline");  // Network offline
throw simulateNetworkError("serverError");  // 500 error
```

---

## Configuration

### Access Configuration

```javascript
import {
  API_CONFIG,
  INTRINSIC_CONFIG,
  PLANE_MAPPING_CONFIG,
  GROUND_PLANE_CONFIG,
} from "@/config/calibrationConfig";

// API settings
console.log(API_CONFIG.TIMEOUT);  // 60000ms
console.log(API_CONFIG.RETRY_COUNT);  // 3

// Intrinsic settings
console.log(INTRINSIC_CONFIG.MIN_SAMPLES);  // 18
console.log(INTRINSIC_CONFIG.REQUIRED_RMS);  // 2.0px

// Plane mapping settings
console.log(PLANE_MAPPING_CONFIG.POSE_CONFIDENCE_THRESHOLD);  // 0.7

// Ground plane settings
console.log(GROUND_PLANE_CONFIG.MIN_CORRESPONDENCES);  // 4
```

### Helper Functions

```javascript
import { getApiUrl, getThemeColor, isFeatureEnabled } from "@/config/calibrationConfig";

// Get API endpoint URL
const endpoint = getApiUrl("CAPTURE_SAMPLE", { id: "front" });
// "http://localhost:8000/api/calibration/intrinsic/capture"

// Get theme color
const color = getThemeColor("PRIMARY_COLOR");  // "#3b82f6"

// Check feature flag
if (isFeatureEnabled("MULTI_CAMERA_SYNC")) {
  // Show multi-camera UI
}
```

---

## Common Patterns

### Complete Calibration Step Flow

```javascript
import { useAsync } from "@/hooks/useCalibration";
import { validateIntrinsicStep } from "@/lib/validationRules";
import { useCalibrationState, useUpdateCalibration } from "@/context/CalibrationContext";
import { LoadingSpinner, ErrorCard } from "@/components/calibration/LoadingStates";

export function IntrinsicStep() {
  const { intrinsic } = useCalibrationState();
  const { setIntrinsicResult } = useUpdateCalibration();
  
  // Handle API call
  const { execute: solve, status, error } = useAsync(
    () => apiService.solveIntrinsic(cameraId, sampleIds),
    false
  );

  const handleSolve = async () => {
    // Validate first
    const validation = validateIntrinsicStep(intrinsic);
    if (!validation.valid) {
      showError(validation.errors[0]);
      return;
    }

    // Make API call
    const result = await solve();
    
    // Update state
    setIntrinsicResult(result);
    
    // Show success
    showSuccess("Intrinsic solved!");
  };

  if (status === "pending") return <LoadingSpinner />;
  if (status === "error") return <ErrorCard error={error} />;

  return (
    <div>
      <button onClick={handleSolve}>
        Solve Intrinsic
      </button>
    </div>
  );
}
```

### Multi-Camera Sync

```javascript
const { execute: sync, status } = useAsync(
  () => apiService.syncSnapshots(selectedCameraIds),
  false
);

const handleSync = async () => {
  const snapshots = await sync();
  
  // Process snapshots for each camera
  snapshots.forEach((snapshot) => {
    // Process ground plane for this camera
    processGroundPlane(snapshot.cameraId, snapshot.url);
  });
};
```

### Error Recovery

```javascript
const { notification, execute: retryOperation } = useAsync(apiCall, false);

if (notification?.recoveryStrategy === "RETRY") {
  return (
    <ErrorCard error={notification.error}>
      <button onClick={() => retryOperation()}>
        Retry
      </button>
    </ErrorCard>
  );
} else if (notification?.recoveryStrategy === "USER_ACTION") {
  return (
    <WarningCard>
      {notification.suggestedAction}
    </WarningCard>
  );
}
```

---

## Next Steps

1. **Implement Backend Endpoints** - Create Node.js/Python servers matching API_IMPLEMENTATION_GUIDE.md
2. **Deploy ML Models** - Set up YOLOv8-Pose, YOLOv8-Seg servers
3. **Integration Testing** - Test each step with real camera feeds
4. **Performance Optimization** - Profile and optimize slow paths
5. **Production Deployment** - Set up CI/CD pipeline and monitoring

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Context API](https://react.dev/reference/react/useContext)
- [YOLOv8 Documentation](https://docs.ultralytics.com/)
- [OpenCV Camera Calibration](https://docs.opencv.org/master/d4/d94/tutorial_camera_calibration.html)
