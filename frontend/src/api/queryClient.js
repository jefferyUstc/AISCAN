import { QueryClient } from "@tanstack/react-query";

// Retry transient failures (5xx / network) once, but never retry a
// deterministic 4xx (e.g. "gene not found") — retrying it just wastes a
// round-trip and delays the error the user needs to see.
export function retry(failureCount, error) {
  const status = error?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry,
      refetchOnWindowFocus: false,
    },
  },
});
