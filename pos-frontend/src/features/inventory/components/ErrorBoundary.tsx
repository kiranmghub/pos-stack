// pos-frontend/src/features/inventory/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary - Catches React errors and displays a fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <EmptyState
          icon={<AlertCircle className="h-12 w-12 text-destructive" />}
          title="Something went wrong"
          description={
            this.state.error?.message ||
            "An unexpected error occurred. Please try refreshing the page."
          }
          action={{
            label: "Reload Page",
            onClick: () => window.location.reload(),
          }}
          secondaryAction={{
            label: "Go Back",
            onClick: () => window.history.back(),
          }}
          variant="error"
        />
      );
    }

    return this.props.children;
  }
}

