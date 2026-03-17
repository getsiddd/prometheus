/**
 * Navigation Guards & Route Protection
 * Ensures users complete steps in order
 */

import { getCalibrationReadiness, canProceedToNextStep } from "./validationRules";

export const CALIBRATION_STEPS = [
  "intrinsic",
  "plane-mapping",
  "ground-plane",
];

/**
 * Get step index in workflow
 */
export function getStepIndex(step) {
  return CALIBRATION_STEPS.indexOf(step);
}

/**
 * Get next step after current
 */
export function getNextStep(currentStep) {
  const index = getStepIndex(currentStep);
  return index < CALIBRATION_STEPS.length - 1
    ? CALIBRATION_STEPS[index + 1]
    : null;
}

/**
 * Get previous step
 */
export function getPreviousStep(currentStep) {
  const index = getStepIndex(currentStep);
  return index > 0 ? CALIBRATION_STEPS[index - 1] : null;
}

/**
 * Check if user can access a specific step
 */
export function canAccessStep(stepName, state, options = {}) {
  const { allowSkip = false } = options;

  // Steps can go backward (revisit previous steps)
  if (CALIBRATION_STEPS.indexOf(stepName) < 0) {
    return { allowed: false, reason: "Invalid step" };
  }

  // Check if all previous steps are complete
  const readiness = getCalibrationReadiness(state);
  const previousSteps = CALIBRATION_STEPS.slice(
    0,
    getStepIndex(stepName)
  );

  for (const prevStep of previousSteps) {
    if (prevStep === "intrinsic" && !readiness.intrinsic && !allowSkip) {
      return {
        allowed: false,
        reason: "Complete Intrinsic Calibration first",
        blockedBy: "intrinsic",
      };
    }
    if (prevStep === "plane-mapping" && !readiness.planeMapping && !allowSkip) {
      return {
        allowed: false,
        reason: "Complete Plane Mapping first",
        blockedBy: "plane-mapping",
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if user can proceed from current step to next
 */
export function canProceedToStep(fromStep, toStep, state) {
  const fromIndex = getStepIndex(fromStep);
  const toIndex = getStepIndex(toStep);

  // Going backward is always allowed
  if (toIndex < fromIndex) {
    return { canProceed: true, forward: false };
  }

  // Going forward requires current step completion
  const validation = canProceedToNextStep(fromStep, state);

  return {
    canProceed: validation.canProceed,
    forward: true,
    blockers: validation.blockers,
    suggestions: validation.suggestions,
  };
}

/**
 * Get navigation state for current step
 */
export function getNavigationState(currentStep, state) {
  const stepIndex = getStepIndex(currentStep);
  const previousStep = getPreviousStep(currentStep);
  const nextStep = getNextStep(currentStep);
  const proceedValidator = nextStep
    ? canProceedToStep(currentStep, nextStep, state)
    : null;

  return {
    currentStep,
    stepNumber: stepIndex + 1,
    totalSteps: CALIBRATION_STEPS.length,
    canGoBack: !!previousStep,
    canGoForward: proceedValidator?.canProceed || false,
    nextStep,
    previousStep,
    blockers: proceedValidator?.blockers || [],
    suggestions: proceedValidator?.suggestions || [],
    isLastStep: stepIndex === CALIBRATION_STEPS.length - 1,
  };
}

/**
 * Get breadcrumb navigation structure
 */
export function getBreadcrumbs(currentStep, state) {
  const readiness = getCalibrationReadiness(state);

  return CALIBRATION_STEPS.map((step, index) => ({
    step,
    label: step.replace("-", " ").toUpperCase(),
    stepNumber: index + 1,
    current: step === currentStep,
    completed:
      step === "intrinsic"
        ? readiness.intrinsic
        : step === "plane-mapping"
          ? readiness.planeMapping
          : readiness.groundPlane,
    accessible: canAccessStep(step, state).allowed,
  }));
}

/**
 * URL helper for navigation
 */
export function getStepUrl(cameraId, step) {
  if (step === "intro" || step === null) {
    return `/camera/${cameraId}`;
  }
  return `/camera/${cameraId}/${step}`;
}

/**
 * Check if step should show warning
 */
export function shouldShowStepWarning(step, state) {
  const access = canAccessStep(step, state);
  return !access.allowed;
}

/**
 * Get warning message for blocked step
 */
export function getStepBlockingMessage(step, state) {
  const access = canAccessStep(step, state);
  if (access.allowed) return null;

  const blockedBy = access.blockedBy;
  const blockedByLabel = blockedBy
    ?.replace("-", " ")
    ?.toUpperCase() || "previous";

  return `Complete ${blockedByLabel} Calibration first`;
}

/**
 * Create navigation event (for analytics, logging, etc.)
 */
export function createNavigationEvent(fromStep, toStep, state, success) {
  return {
    type: "CALIBRATION_NAVIGATION",
    timestamp: new Date().toISOString(),
    from: fromStep,
    to: toStep,
    direction: getStepIndex(toStep) > getStepIndex(fromStep) ? "forward" : "back",
    success,
    state: {
      intrinsicValid: state.intrinsicSolveResult !== null,
      planeMappingValid: state.correspondences?.length > 0,
      groundPlaneValid: (state.correspondences?.length || 0) > 4,
    },
  };
}

/**
 * Middleware for route protection
 */
export function createRouteGuard(cameraId, requestedStep, state) {
  // Always allow access to intro
  if (requestedStep === null || requestedStep === "intro") {
    return {
      allowed: true,
      redirect: null,
      message: null,
    };
  }

  // Validate step access
  const accessCheck = canAccessStep(requestedStep, state);

  if (!accessCheck.allowed) {
    return {
      allowed: false,
      redirect: getStepUrl(cameraId, accessCheck.blockedBy),
      message: accessCheck.reason,
    };
  }

  return {
    allowed: true,
    redirect: null,
    message: null,
  };
}

/**
 * Get suggested next action for user
 */
export function getSuggestedNavigation(currentStep, state) {
  const readiness = getCalibrationReadiness(state);

  // If current step is not complete, suggest completing it
  if (currentStep === "intrinsic" && !readiness.intrinsic) {
    return {
      suggestion: "Complete Intrinsic Calibration",
      action: "continue_current",
      step: "intrinsic",
    };
  }

  if (currentStep === "plane-mapping" && !readiness.planeMapping) {
    return {
      suggestion: "Complete Plane Mapping",
      action: "continue_current",
      step: "plane-mapping",
    };
  }

  if (currentStep === "ground-plane" && !readiness.groundPlane) {
    return {
      suggestion: "Complete Ground Plane Calibration",
      action: "continue_current",
      step: "ground-plane",
    };
  }

  // If all complete, suggest export
  if (readiness.allComplete) {
    return {
      suggestion: "Export calibration results",
      action: "export",
      step: null,
    };
  }

  // Suggest next incomplete step
  if (!readiness.intrinsic) {
    return {
      suggestion: "Start with Intrinsic Calibration",
      action: "goto_step",
      step: "intrinsic",
    };
  }

  if (!readiness.planeMapping) {
    return {
      suggestion: "Proceed to Plane Mapping",
      action: "goto_step",
      step: "plane-mapping",
    };
  }

  if (!readiness.groundPlane) {
    return {
      suggestion: "Proceed to Ground Plane Calibration",
      action: "goto_step",
      step: "ground-plane",
    };
  }

  return {
    suggestion: null,
    action: "complete",
    step: null,
  };
}
