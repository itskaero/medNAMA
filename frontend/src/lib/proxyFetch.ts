/**
 * Fetches with a single automatic retry for one specific failure mode:
 * the Next.js standalone proxy holding a pooled keep-alive socket to the
 * backend that uvicorn already closed (uvicorn's default keep-alive timeout
 * is 5s). Such a request dies at the connection layer — it never reaches the
 * backend — and surfaces to the browser as either:
 *
 *   1. a fetch() network error ("socket hang up" / "Failed to fetch"), or
 *   2. HTTP 500 with a plain-text "Internal Server Error" body (Next.js's
 *      proxy-failure response), which breaks callers doing res.json().
 *
 * Both are safe to replay once because the backend never processed the
 * request. Client-initiated aborts (AbortError) are never retried.
 */
export async function proxySafeFetch(url: string, init: RequestInit): Promise<Response> {
  const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt === 1 && !isAbort(err)) continue; // connection-level failure -> retry
      throw err;
    }

    if (res.ok) return res;

    // HTTP 500 + non-JSON body is the proxy's dead-socket failure signature.
    const isProxyError500 =
      res.status === 500 &&
      !(res.headers.get("content-type") ?? "").includes("application/json");
    if (attempt === 1 && isProxyError500) {
      const body = await res.clone().text();
      if (/internal server error/i.test(body)) continue;
    }

    return res;
  }

  throw new Error("Request failed after retry.");
}