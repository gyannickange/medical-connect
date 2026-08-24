import React from "react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/errorLogStore";
import { t } from "@/lib/i18n";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logError({
      module: "uncaught",
      message: error.message,
      stack: error.stack,
      context: { componentStack: info.componentStack ?? "" },
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center p-6 text-center">
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold">
                {t("errorBoundaryTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("errorBoundaryMessage")}
              </p>
            </div>
            <Button onClick={() => window.location.reload()}>
              {t("errorBoundaryReload")}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
