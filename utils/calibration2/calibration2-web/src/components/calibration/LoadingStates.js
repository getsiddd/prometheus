"use client";

import React from "react";

/**
 * Loading and State Components
 */

export function LoadingSpinner({ size = "md", color = "blue" }) {
  const sizeClass = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  }[size];

  const colorClass = {
    blue: "border-blue-500",
    emerald: "border-emerald-500",
    amber: "border-amber-500",
  }[color];

  return (
    <div
      className={`${sizeClass} border-4 ${colorClass} border-zinc-700 rounded-full animate-spin`}
    />
  );
}

export function LoadingOverlay({ message, progress }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg p-8 space-y-4 max-w-md">
        <div className="flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
        <p className="text-center text-white font-medium">{message}</p>
        {progress !== undefined && (
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function SkeletonLoader({ count = 1, height = "h-12" }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${height} bg-zinc-800 rounded animate-pulse`}
        />
      ))}
    </div>
  );
}

/**
 * Status Indicators
 */

export function StatusBadge({ status, label }) {
  const statusClasses = {
    idle: "bg-zinc-800 text-zinc-300",
    loading: "bg-blue-900 text-blue-200",
    success: "bg-emerald-900 text-emerald-200",
    error: "bg-red-900 text-red-200",
    warning: "bg-amber-900 text-amber-200",
  };

  const icons = {
    idle: "⏳",
    loading: "⏳",
    success: "✓",
    error: "✗",
    warning: "⚠",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-medium ${
        statusClasses[status] || statusClasses.idle
      }`}
    >
      <span>{icons[status]}</span>
      <span>{label}</span>
    </div>
  );
}

export function ProgressIndicator({
  steps,
  currentStep,
  completed,
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <div
            className={`flex flex-col items-center ${
              index <= currentStep ? "opacity-100" : "opacity-50"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                index < currentStep
                  ? "bg-emerald-600 text-white"
                  : index === currentStep
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {index < currentStep ? "✓" : index + 1}
            </div>
            <span className="text-xs mt-1 text-center">{step}</span>
          </div>

          {index < steps.length - 1 && (
            <div
              className={`flex-1 h-1 mx-2 ${
                index < currentStep ? "bg-emerald-600" : "bg-zinc-800"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Message Cards
 */

export function ErrorCard({ title, message, actions = [] }) {
  return (
    <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-red-300">{title}</h3>
        <p className="text-sm text-red-200">{message}</p>
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                action.primary
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WarningCard({ title, message, actions = [] }) {
  return (
    <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-amber-300">⚠️ {title}</h3>
        <p className="text-sm text-amber-200">{message}</p>
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                action.primary
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SuccessCard({ title, message }) {
  return (
    <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-4">
      <h3 className="font-semibold text-emerald-300">✓ {title}</h3>
      <p className="text-sm text-emerald-200">{message}</p>
    </div>
  );
}

export function InfoCard({ title, message }) {
  return (
    <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
      <h3 className="font-semibold text-blue-300">ℹ️ {title}</h3>
      <p className="text-sm text-blue-200">{message}</p>
    </div>
  );
}

/**
 * Button States
 */

export function LoadingButton({
  children,
  loading,
  disabled,
  onClick,
  className,
  ...props
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  );
}

/**
 * Validation Message
 */

export function ValidationMessage({
  type = "error",
  message,
  suggestions = [],
}) {
  const typeClasses = {
    error: "bg-red-900/20 border-red-800 text-red-200",
    warning: "bg-amber-900/20 border-amber-800 text-amber-200",
    success: "bg-emerald-900/20 border-emerald-800 text-emerald-200",
  };

  return (
    <div className={`border rounded-lg p-3 space-y-2 text-sm ${typeClasses[type]}`}>
      <p>{message}</p>
      {suggestions.length > 0 && (
        <ul className="list-disc list-inside opacity-80">
          {suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
