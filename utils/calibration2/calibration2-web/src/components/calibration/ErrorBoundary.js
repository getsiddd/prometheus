"use client";

import React from "react";
import { logError } from "@/lib/errorHandler";

/**
 * ErrorBoundary Component
 * Catches rendering errors and displays user-friendly messages
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    logError(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex items-center justify-center">
          <div className="max-w-2xl bg-zinc-900 border border-red-800 rounded-lg p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-red-400">
                ⚠️ Something went wrong
              </h1>
              <p className="text-sm text-zinc-400 mt-2">
                An unexpected error occurred in the calibration system.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="bg-zinc-800 p-4 rounded text-xs font-mono space-y-2">
                <div>
                  <p className="font-bold text-red-300">Error:</p>
                  <p className="text-zinc-300">{this.state.error.toString()}</p>
                </div>
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <p className="font-bold text-zinc-400">Component Stack:</p>
                    <pre className="text-zinc-400 overflow-auto max-h-40">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={this.resetError}
                className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
              >
                Try Again
              </button>
              <a
                href="/"
                className="block w-full px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-center text-white font-medium transition"
              >
                Go Home
              </a>
            </div>

            <p className="text-xs text-zinc-500">
              Error ID: {Date.now().toString(36)}-{Math.random().toString(36).substr(2, 9)}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
