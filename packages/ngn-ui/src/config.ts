declare global {
  interface Window {
    __NGN_CONFIG__?: { apiUrl?: string };
  }
}

export const NGN_API_URL =
  (typeof window !== "undefined" && window.__NGN_CONFIG__?.apiUrl) ||
  import.meta.env.VITE_NGN_API_URL ||
  "http://localhost:8787/api";
