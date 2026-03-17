/**
 * Custom React Hooks for Calibration
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { createErrorNotification, logError } from "@/lib/errorHandler";

/**
 * Hook for managing async operations with loading/error states
 */
export function useAsync(asyncFunction, immediate = true) {
  const [status, setStatus] = useState("idle");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const execute = useCallback(
    async (...args) => {
      setStatus("pending");
      setData(null);
      setError(null);
      setNotification(null);

      try {
        const response = await asyncFunction(...args);
        if (mountedRef.current) {
          setData(response);
          setStatus("success");
        }
        return response;
      } catch (err) {
        if (mountedRef.current) {
          setError(err);
          setStatus("error");
          setNotification(createErrorNotification(err));
          logError(err);
        }
        throw err;
      }
    },
    [asyncFunction]
  );

  useEffect(() => {
    if (immediate) {
      execute();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [execute, immediate]);

  return { execute, status, data, error, notification };
}

/**
 * Hook for managing debounced updates
 */
export function useDebouncedValue(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for managing previous value
 */
export function usePrevious(value) {
  const ref = useRef();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Hook for validation state
 */
export function useValidation(initialState = {}) {
  const [errors, setErrors] = useState(initialState);
  const [touched, setTouched] = useState({});

  const setFieldError = useCallback((field, error) => {
    setErrors((prev) => ({ ...prev, [field]: error }));
  }, []);

  const setFieldTouched = useCallback((field, value = true) => {
    setTouched((prev) => ({ ...prev, [field]: value }));
  }, []);

  const clearErrors = useCallback(() => setErrors(initialState), [initialState]);
  const clearField = useCallback((field) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  const hasErrors = Object.keys(errors).length > 0;
  const getFieldError = useCallback(
    (field) => errors[field],
    [errors]
  );

  return {
    errors,
    touched,
    setFieldError,
    setFieldTouched,
    clearErrors,
    clearField,
    hasErrors,
    getFieldError,
  };
}

/**
 * Hook for tracking step progress
 */
export function useStepProgress(totalSteps, initialStep = 0) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completed, setCompleted] = useState([]);

  const goToStep = useCallback((step) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step);
    }
  }, [totalSteps]);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, totalSteps]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const completeStep = useCallback((step = currentStep) => {
    setCompleted((prev) => {
      if (!prev.includes(step)) {
        return [...prev, step];
      }
      return prev;
    });
  }, [currentStep]);

  const isStepCompleted = useCallback(
    (step) => completed.includes(step),
    [completed]
  );

  const isStepActive = useCallback(
    (step) => step === currentStep,
    [currentStep]
  );

  const progress = Math.round(((currentStep + 1) / totalSteps) * 100);

  return {
    currentStep,
    totalSteps,
    completed,
    progress,
    goToStep,
    nextStep,
    previousStep,
    completeStep,
    isStepCompleted,
    isStepActive,
  };
}

/**
 * Hook for managing clipboard
 */
export function useClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, timeout);

        return true;
      } catch (err) {
        logError(err, { action: "copy_to_clipboard" });
        return false;
      }
    },
    [timeout]
  );

  return { copied, copy };
}

/**
 * Hook for preventing multiple submissions
 */
export function useSubmitHandler(onSubmit) {
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  const handleSubmit = useCallback(
    async (...args) => {
      // Prevent double-submit
      const now = Date.now();
      if (now - lastSubmitTime < 500 || submitting) {
        return;
      }

      setLastSubmitTime(now);
      setSubmitting(true);

      try {
        await onSubmit(...args);
      } finally {
        setSubmitting(false);
      }
    },
    [onSubmit, lastSubmitTime, submitting]
  );

  return { submitting, handleSubmit };
}

/**
 * Hook for managing local storage
 */
export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      logError(error, { action: "read_local_storage", key });
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);

        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        logError(error, { action: "write_local_storage", key });
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * Hook for managing modal state
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}

/**
 * Hook for managing form state
 */
export function useForm(initialState, onSubmit) {
  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }, []);

  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched((prev) => ({
      ...prev,
      [name]: true,
    }));
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setSubmitting(true);

      try {
        await onSubmit(values);
      } catch (err) {
        logError(err, { action: "form_submit" });
      } finally {
        setSubmitting(false);
      }
    },
    [values, onSubmit]
  );

  const reset = useCallback(() => {
    setValues(initialState);
    setErrors({});
    setTouched({});
  }, [initialState]);

  return {
    values,
    errors,
    touched,
    submitting,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    setValues,
    setErrors,
  };
}
