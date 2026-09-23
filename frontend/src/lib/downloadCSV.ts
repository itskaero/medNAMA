import { proxySafeFetch } from "./proxyFetch";

/**
 * Downloads an authenticated CSV export endpoint into a file download.
 * Returns true on success so callers can show a toast.
 */
export async function downloadAuthenticatedCSV(
  url: string,
  filename: string,
  token: string | null
): Promise<boolean> {
  const savedToken = localStorage.getItem("token") || token;
  try {
    const res = await proxySafeFetch(url, {
      headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : {},
      credentials: "include",
    });
    if (!res.ok) {
      console.error(`Export failed (HTTP ${res.status}).`);
      return false;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch (err) {
    console.error("Export failed:", err);
    return false;
  }
}