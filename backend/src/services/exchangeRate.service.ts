import { env } from "@config/env";

type Currency = "ILS" | "USD" | "EUR";

interface CacheEntry {
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // שעה - שערי מטבע לא זזים מספיק מהר כדי להצדיק יותר מזה
let cache: CacheEntry | null = null;

/**
 * מביא שערי המרה חיים (open.er-api.com, חינמי, בלי API key) יחסית למטבע
 * הבסיס שהוגדר במערכת (ברירת מחדל ILS), עם cache בזיכרון לשעה.
 */
async function fetchRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }

  const res = await fetch(`https://open.er-api.com/v6/latest/${env.BASE_CURRENCY}`);
  if (!res.ok) {
    throw new Error(`Exchange rate API returned ${res.status}`);
  }
  const data = (await res.json()) as { result: string; rates: Record<string, number> };
  if (data.result !== "success") {
    throw new Error("Exchange rate API returned a non-success result");
  }

  cache = { rates: data.rates, fetchedAt: Date.now() };
  return cache.rates;
}

/**
 * מחזיר את השער להמרת 1 יחידה של `from` למטבע הבסיס.
 * אם from כבר שווה למטבע הבסיס, מחזיר 1 בלי לקרוא ל-API.
 */
export async function getRateToBase(from: Currency): Promise<number> {
  if (from === env.BASE_CURRENCY) return 1;

  const rates = await fetchRates();
  // open.er-api מחזיר שערים *מתוך* מטבע הבסיס אל כל שאר המטבעות (BASE -> from),
  // ואנחנו צריכים את ההפוך (from -> BASE) - ולכן הופכים (1 / rate).
  const rateBaseToFrom = rates[from];
  if (!rateBaseToFrom) {
    throw new Error(`No exchange rate available for currency ${from}`);
  }
  return 1 / rateBaseToFrom;
}
