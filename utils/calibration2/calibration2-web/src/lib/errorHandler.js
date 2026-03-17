/**
 * Error Handling & Recovery Utilities
 */

export const ERROR_TYPES = {
  CAMERA_OFFLINE: "CAMERA_OFFLINE",
  NOT_FOUND: "NOT_FOUND",
  INVALID_PARAM: "INVALID_PARAM",
  PROCESSING_FAILED: "PROCESSING_FAILED",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
};

export class CalibrationError extends Error {
  constructor(message, type = ERROR_TYPES.PROCESSING_FAILED, context = {}) {
    super(message);
    this.name = "CalibrationError";
    this.type = type;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Error messages for user display
 */
export const ERROR_MESSAGES = {
  CAMERA_OFFLINE:
    "Camera is offline or unreachable. Check connection and try again.",
  NOT_FOUND: "Resource not found. Please verify the camera ID.",
  INVALID_PARAM: "Invalid parameters provided. Check input values.",
  PROCESSING_FAILED: "Processing failed. Please try again or contact support.",
  MODEL_NOT_FOUND: "Required ML model not found. Check server configuration.",
  INSUFFICIENT_DATA:
    "Not enough data captured. Please capture more samples and try again.",
  NETWORK_ERROR: "Network error. Check your connection and try again.",
  TIMEOUT: "Operation timed out. This may indicate a slow network or server.",
  VALIDATION_ERROR: "Validation failed. Check the required parameters.",
  UNKNOWN: "An unexpected error occurred. Please try again.",
};

/**
 * Convert error to user-friendly message
 */
export function getErrorMessage(error) {
  if (error instanceof CalibrationError) {
    return ERROR_MESSAGES[error.type] || ERROR_MESSAGES.UNKNOWN;
  }

  if (error?.code === "CAMERA_OFFLINE") {
    return ERROR_MESSAGES.CAMERA_OFFLINE;
  }

  if (error?.code?.includes("HTTP_5")) {
    return ERROR_MESSAGES.PROCESSING_FAILED;
  }

  if (error?.message?.includes("timeout")) {
    return ERROR_MESSAGES.TIMEOUT;
  }

  if (error?.message?.includes("fetch")) {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }

  return error?.message || ERROR_MESSAGES.UNKNOWN;
}

/**
 * Error recovery strategies
 */
export const RecoveryStrategy = {
  RETRY: "RETRY",
  USER_ACTION: "USER_ACTION",
  CONTACT_SUPPORT: "CONTACT_SUPPORT",
  SKIP_STEP: "SKIP_STEP",
};

/**
 * Get recovery strategy based on error type
 */
export function getRecoveryStrategy(errorType) {
  const strategies = {
    [ERROR_TYPES.CAMERA_OFFLINE]: RecoveryStrategy.USER_ACTION,
    [ERROR_TYPES.NOT_FOUND]: RecoveryStrategy.USER_ACTION,
    [ERROR_TYPES.INVALID_PARAM]: RecoveryStrategy.USER_ACTION,
    [ERROR_TYPES.PROCESSING_FAILED]: RecoveryStrategy.RETRY,
    [ERROR_TYPES.MODEL_NOT_FOUND]: RecoveryStrategy.CONTACT_SUPPORT,
    [ERROR_TYPES.INSUFFICIENT_DATA]: RecoveryStrategy.USER_ACTION,
    [ERROR_TYPES.NETWORK_ERROR]: RecoveryStrategy.RETRY,
    [ERROR_TYPES.TIMEOUT]: RecoveryStrategy.RETRY,
    [ERROR_TYPES.VALIDATION_ERROR]: RecoveryStrategy.USER_ACTION,
  };

  return strategies[errorType] || RecoveryStrategy.CONTACT_SUPPORT;
}

/**
 * Log error for debugging
 */
export function logError(error, context = {}) {
  if (process.env.NODE_ENV === "development") {
    console.error("CalibrationError:", {
      ...error?.toJSON?.(),
      context,
      stack: error?.stack,
    });
  }

  // Send to error tracking service (Sentry, etc.)
  if (window.__errorTracking) {
    window.__errorTracking.captureException(error, { extra: context });
  }
}

/**
 * Create user-friendly error notification
 */
export function createErrorNotification(error, context = {}) {
  const message = getErrorMessage(error);
  const strategy = getRecoveryStrategy(error?.type);

  logError(error, context);

  return {
    message,
    type: error?.type || ERROR_TYPES.PROCESSING_FAILED,
    strategy,
    timestamp: new Date().toISOString(),
    actions: getRecoveryActions(strategy),
  };
}

/**
 * Get recommended actions for recovery
 */
export function getRecoveryActions(strategy) {
  const actionMap = {
    [RecoveryStrategy.RETRY]: [
      { label: "Retry", action: "retry", primary: true },
      { label: "Cancel", action: "cancel", primary: false },
    ],
    [RecoveryStrategy.USER_ACTION]: [
      { label: "Try Again", action: "retry", primary: true },
      { label: "Go Back", action: "back", primary: false },
    ],
    [RecoveryStrategy.CONTACT_SUPPORT]: [
      { label: "Contact Support", action: "support", primary: true },
      { label: "Go Back", action: "back", primary: false },
    ],
    [RecoveryStrategy.SKIP_STEP]: [
      { label: "Skip This Step", action: "skip", primary: false },
      { label: "Try Again", action: "retry", primary: true },
    ],
  };

  return actionMap[strategy] || [];
}
