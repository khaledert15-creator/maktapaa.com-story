export type CommerceEvent = "ViewContent" | "Search" | "AddToCart" | "RemoveFromCart" | "InitiateCheckout" | "Purchase";
export type AnalyticsPayload = {
  contentId?: string | number;
  contentName?: string;
  searchTerm?: string;
  value?: number;
  currency?: "EGP";
  quantity?: number;
  orderNumber?: string;
  items?: { id: string | number; name: string; price: number; quantity: number }[];
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[][]; loaded?: boolean; version?: string };
    ttq?: { load?: (id: string) => void; page?: () => void; track?: (event: string, data?: Record<string, unknown>) => void; _i?: Record<string, unknown[]> };
  }
}

const enabled = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
const gaId = String(import.meta.env.VITE_GA4_ID || "").trim();
const metaId = String(import.meta.env.VITE_META_PIXEL_ID || "").trim();
const tiktokId = String(import.meta.env.VITE_TIKTOK_PIXEL_ID || "").trim();
const safeId = /^[A-Za-z0-9_-]{3,80}$/;

export function isAnalyticsEnabled(): boolean {
  return enabled && [gaId, metaId, tiktokId].some(id => safeId.test(id));
}

function addScript(id: string, src: string): void {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.append(script);
}

export function initializeAnalytics(): void {
  if (!enabled || typeof window === "undefined") return;
  if (safeId.test(gaId)) {
    window.dataLayer ||= [];
    window.gtag = (...args: unknown[]) => { window.dataLayer?.push(args); };
    window.gtag("js", new Date());
    window.gtag("config", gaId, { anonymize_ip: true });
    addScript("maktaba-ga4", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`);
  }
  if (safeId.test(metaId)) {
    const fbq = ((...args: unknown[]) => { fbq.queue?.push(args); }) as NonNullable<Window["fbq"]>;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = window.fbq || fbq;
    window.fbq("init", metaId);
    window.fbq("track", "PageView");
    addScript("maktaba-meta-pixel", "https://connect.facebook.net/en_US/fbevents.js");
  }
  if (safeId.test(tiktokId)) {
    window.ttq ||= { _i: {} };
    addScript("maktaba-tiktok-pixel", `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(tiktokId)}&lib=ttq`);
  }
}

const gaNames: Record<CommerceEvent, string> = {
  ViewContent: "view_item", Search: "search", AddToCart: "add_to_cart", RemoveFromCart: "remove_from_cart", InitiateCheckout: "begin_checkout", Purchase: "purchase",
};

export function trackCommerceEvent(event: CommerceEvent, payload: AnalyticsPayload = {}): void {
  if (!enabled || typeof window === "undefined") return;
  const currency = payload.currency || "EGP";
  const items = payload.items || (payload.contentId ? [{ id: payload.contentId, name: payload.contentName || "", price: payload.value || 0, quantity: payload.quantity || 1 }] : undefined);
  const common = { value: payload.value, currency, items: items?.map(item => ({ item_id: item.id, item_name: item.name, price: item.price, quantity: item.quantity })), search_term: payload.searchTerm, transaction_id: payload.orderNumber };
  if (safeId.test(gaId)) window.gtag?.("event", gaNames[event], common);
  if (safeId.test(metaId)) window.fbq?.("track", event, { content_ids: items?.map(item => item.id), content_name: payload.contentName, contents: items, search_string: payload.searchTerm, value: payload.value, currency });
  if (safeId.test(tiktokId)) window.ttq?.track?.(event, { content_id: payload.contentId, content_name: payload.contentName, contents: items, query: payload.searchTerm, value: payload.value, currency });
}
