import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { offlineApiRequest } from "./offlineApiRequest";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Handle 401 Unauthorized - redirect to login
    if (res.status === 401) {
      // Only redirect if not already on public pages (use exact match to avoid false positives)
      if (
        window.location.pathname !== "/login" &&
        window.location.pathname !== "/register" &&
        window.location.pathname !== "/reset-password" &&
        window.location.pathname !== "/request-password-reset"
      ) {
        window.location.href = "/login";
      }
    }

    // Preserve the response body for the shared asynchronous normalizer.
    throw res;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Helper to extract collection from URL
function extractCollectionFromUrl(url: string): string {
  if (url.includes("/api/staff")) return "staff";

  const match = url.match(/\/api\/(\w+)/);
  return match ? match[1] : "general";
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    
    // Use offlineApiRequest for all GET requests (with caching)
    const res = await offlineApiRequest("GET", url, undefined, {
      collection: extractCollectionFromUrl(url)
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (!res.ok) {
      await throwIfResNotOk(res as Response);
    }
    
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
