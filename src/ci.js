/* Shared CI Event API helpers (used by both Custom Event and Embedding) */
export const BASE = (import.meta.env.VITE_CI_API_ENDPOINT || "").replace(/\/$/, "");
export const TOKEN = import.meta.env.VITE_CI_APP_TOKEN || "";
export const EVENTS_PATH = import.meta.env.VITE_EVENTS_PATH || "/events/published";

const url = (path) => `${BASE}${path}${path.includes("?") ? "&" : "?"}emApplicationtoken=${encodeURIComponent(TOKEN)}`;

export async function api(path, options) {
  const res = await fetch(url(path), { headers: { Accept: "application/json", "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(`CI Event API returned ${res.status}. ${res.status === 401 ? "Check the token." : res.status === 400 ? "Check that this site's origin is registered on the web application." : ""}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/* Mappers: the only place that knows CI field names.
   If something shows blank, open DevTools > Network, look at the JSON and adjust here. */
export const list = (d) => (Array.isArray(d) ? d : d?.value ?? d?.items ?? d?.events ?? d?.passes ?? []);
export const toEvent = (e) => ({
  key: e.readableEventId ?? e.readableEventID ?? e.msevtmgt_readableeventid ?? e.id,
  name: e.name ?? e.eventName ?? e.msevtmgt_name ?? "Untitled event",
  start: e.startDate ?? e.eventStartDate ?? e.startTime ?? e.msevtmgt_eventstartdate,
  location: e.location ?? e.venue ?? e.msevtmgt_venuename ?? "",
  description: e.description ?? e.msevtmgt_description ?? "",
});
export const toPass = (p) => {
  const raw = p.price ?? p.cost ?? p.amount ?? p.msevtmgt_price ?? 0;
  return {
    id: p.id ?? p.passId ?? p.msevtmgt_passid,
    name: p.name ?? p.title ?? p.msevtmgt_name ?? "Pass",
    description: p.description ?? p.msevtmgt_description ?? "",
    price: Number(typeof raw === "object" ? raw?.value ?? 0 : raw) || 0,
    currency: p.currency ?? p.currencyCode ?? p.isoCurrencyCode ?? "USD",
  };
};

export const money = (n, c) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n); } catch { return `${n} ${c}`; } };
export const date = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
