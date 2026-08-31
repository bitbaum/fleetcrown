import { RefreshCw } from "lucide-react";

type Props = {
  message?: string;
  /**
   * Underlying error string (e.g. "Timed out after 15s", "HTTP 500"). Rendered
   * as a smaller subline so the user can distinguish a timeout from a server
   * error from a network drop. Pass useFetch's `error` or `data?.error` here.
   */
  detail?: string | null;
  onRetry?: () => void;
};

/**
 * Standard "fetch failed" state used inside Cards.
 * Shows a friendly message, an optional cause subline, and an optional retry button.
 */
export function FetchErrorState({ message = "Couldn't load data", detail, onRetry }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-text-tertiary">{message}</div>
        {detail && (
          <div className="mt-0.5 truncate text-xs text-text-muted" title={detail}>
            {detail}
          </div>
        )}
      </div>
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
