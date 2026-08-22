const DEFAULT_SHEET_ID = "1sJUQHN13YcSvhbFA0vMha4OoI0AkDNX6dfDe1r9UFds";
const DEFAULT_SHEET_GID = "245379965";
const CACHE_TTL_MS = 60_000;

export type SheetShipment = {
  id: string;
  books: string;
  amount: string;
  paymentMethod: string;
  shippingStatus: string;
  trackingNumber: string | null;
  deliveryStatus: string;
  receivedAt: string | null;
  shippedAt: string | null;
};

let cache: { expiresAt: number; rows: string[][] } | null = null;

export function normalizeTrackingPhone(value: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  let normalized = value.trim().replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(persianDigits.indexOf(digit)))
    .replace(/\D/g, "");
  if (normalized.startsWith("0020")) normalized = `0${normalized.slice(4)}`;
  if (normalized.startsWith("20") && normalized.length === 12) normalized = `0${normalized.slice(2)}`;
  return normalized;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function shipmentsForPhone(rows: string[][], mobile: string): SheetShipment[] {
  const target = normalizeTrackingPhone(mobile);
  return rows.slice(2).flatMap((row, index) => {
    const primary = normalizeTrackingPhone(row[4] || "");
    const alternate = normalizeTrackingPhone(row[5] || "");
    if (primary !== target && alternate !== target) return [];
    const books = (row[20] || "").trim();
    const shippingStatus = (row[27] || "").trim();
    const deliveryStatus = (row[29] || "").trim();
    return [{
      id: `sheet-${index + 3}-${String(row[0] || index + 1).trim()}`,
      books,
      amount: (row[21] || "").trim(),
      paymentMethod: (row[22] || "").trim(),
      shippingStatus: shippingStatus || "قيد التجهيز",
      trackingNumber: (row[28] || "").trim() || null,
      deliveryStatus: deliveryStatus || shippingStatus || "قيد التجهيز",
      receivedAt: (row[43] || row[42] || "").trim() || null,
      shippedAt: (row[44] || "").trim() || null,
    }];
  }).reverse();
}

async function loadRows() {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;
  const sheetId = process.env.GOOGLE_TRACKING_SHEET_ID || DEFAULT_SHEET_ID;
  const gid = process.env.GOOGLE_TRACKING_SHEET_GID || DEFAULT_SHEET_GID;
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Google Sheet export failed with ${response.status}`);
  const rows = parseCsv(await response.text());
  cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS };
  return rows;
}

export async function getSheetShipments(mobile: string) {
  return shipmentsForPhone(await loadRows(), mobile);
}
