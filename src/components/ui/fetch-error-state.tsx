import { RefreshCw } from "lucide-react";

type Props = {
  message?: string;
  onRetry?: () => void;
};

/**
 * Standard "fetch failed" state used inside Cards.
 * Shows a friendly message and an optional retry button.
 */
export function FetchErrorState({ message = "Couldn't load data", onRetry }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-tertiary">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}
