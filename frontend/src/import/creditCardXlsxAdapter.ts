import readXlsxFile, { type CellValue, type Sheet } from "read-excel-file/browser";
import type { Currency } from "../types";
import {
  IMPORT_ADAPTER_ID,
  type ImportFileAdapter,
  type ParsedImportFile,
  type ParsedImportRow,
  type RejectedImportRow,
} from "./types";

export const CREDIT_CARD_XLSX_HEADERS = [
  "תאריך רכישה",
  "שם בית עסק",
  "סכום עסקה",
  "מטבע עסקה",
  "סכום חיוב",
  "מטבע חיוב",
  "מס' שובר",
  "פירוט נוסף",
] as const;

const MAX_DATA_ROWS = 5_000;
const MONEY_SCALE = 100n;
const MONEY_MAX_SCALED = 999_999_999_999n;

const CURRENCY_LABELS = new Map<string, Currency>([
  ["ILS", "ILS"],
  ["שח", "ILS"],
  ["ש\"ח", "ILS"],
  ["ש״ח", "ILS"],
  ["USD", "USD"],
  ["דולר", "USD"],
  ["דולר ארה\"ב", "USD"],
  ["דולר ארה״ב", "USD"],
  ["EUR", "EUR"],
  ["אירו", "EUR"],
]);

const SUMMARY_LABELS = new Set(["סה\"כ", "סה״כ", "סה\"כ לחיוב", "סה״כ לחיוב", "סך הכל"]);

export type CreditCardXlsxAdapterErrorCode =
  | "INVALID_WORKBOOK"
  | "MULTIPLE_SHEETS"
  | "HEADERS_NOT_FOUND"
  | "ROW_LIMIT_EXCEEDED";

const ADAPTER_ERROR_MESSAGES: Record<CreditCardXlsxAdapterErrorCode, string> = {
  INVALID_WORKBOOK: "The workbook could not be read",
  MULTIPLE_SHEETS: "The workbook must contain exactly one sheet",
  HEADERS_NOT_FOUND: "The supported statement headers were not found",
  ROW_LIMIT_EXCEEDED: "The statement contains more than 5,000 data rows",
};

export class CreditCardXlsxAdapterError extends Error {
  readonly code: CreditCardXlsxAdapterErrorCode;

  constructor(code: CreditCardXlsxAdapterErrorCode) {
    super(ADAPTER_ERROR_MESSAGES[code]);
    this.name = "CreditCardXlsxAdapterError";
    this.code = code;
  }
}

function isHeaderRow(row: readonly (CellValue | null)[]): boolean {
  return row.length === CREDIT_CARD_XLSX_HEADERS.length
    && CREDIT_CARD_XLSX_HEADERS.every((header, index) => row[index] === header);
}

function isSummaryRow(row: readonly (CellValue | null)[]): boolean {
  const label = row[0];
  return typeof label === "string" && SUMMARY_LABELS.has(label.trim());
}

function parseDate(value: CellValue | null): string | null {
  let year: number;
  let month: number;
  let day: number;

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else if (typeof value === "string") {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    return null;
  }

  if (year < 1 || year > 9_999 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

function parseCurrency(value: CellValue | null): Currency | null {
  if (typeof value !== "string") return null;
  return CURRENCY_LABELS.get(value.trim()) ?? null;
}

function decimalToScaled(value: number): bigint | null {
  if (!Number.isFinite(value)) return null;

  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value.toString());
  if (!match) return null;

  const [, sign, whole, fraction = "", exponentText = "0"] = match;
  const digits = BigInt(`${whole}${fraction}`);
  const decimalPlaces = fraction.length - Number(exponentText);
  const shift = 2 - decimalPlaces;
  let scaled: bigint;

  if (shift >= 0) {
    scaled = digits * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    if (digits % divisor !== 0n) return null;
    scaled = digits / divisor;
  }

  if (sign === "-") scaled = -scaled;
  if (scaled <= 0n || scaled > MONEY_MAX_SCALED) return null;
  return scaled;
}

function parseAmount(value: CellValue | null): { value: number; scaled: bigint } | null {
  if (typeof value !== "number") return null;
  const scaled = decimalToScaled(value);
  return scaled === null ? null : { value, scaled };
}

function parseMerchant(value: CellValue | null): string | null {
  if (typeof value !== "string") return null;
  const merchant = value.trim();
  return merchant.length >= 1 && merchant.length <= 200 ? merchant : null;
}

function voucherReference(value: CellValue | null): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  return null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rejection(rowNumber: number, code: string, message: string): RejectedImportRow {
  return { rowNumber, code, message };
}

async function parseDataRow(
  row: readonly (CellValue | null)[],
  rowNumber: number,
): Promise<ParsedImportRow | RejectedImportRow> {
  const occurredAt = parseDate(row[0] ?? null);
  if (!occurredAt) return rejection(rowNumber, "INVALID_DATE", "Purchase date is invalid");

  const merchant = parseMerchant(row[1] ?? null);
  if (!merchant) return rejection(rowNumber, "INVALID_MERCHANT", "Merchant is invalid");

  const amount = parseAmount(row[2] ?? null);
  if (!amount) return rejection(rowNumber, "INVALID_AMOUNT", "Transaction amount must be positive");

  const currency = parseCurrency(row[3] ?? null);
  if (!currency) return rejection(rowNumber, "UNSUPPORTED_CURRENCY", "Transaction currency is unsupported");

  const chargedAmount = parseAmount(row[4] ?? null);
  if (!chargedAmount) return rejection(rowNumber, "INVALID_CHARGED_AMOUNT", "Charged amount must be positive");

  const chargedCurrency = parseCurrency(row[5] ?? null);
  if (!chargedCurrency) {
    return rejection(rowNumber, "UNSUPPORTED_CHARGED_CURRENCY", "Charged currency is unsupported");
  }

  const voucher = voucherReference(row[6] ?? null);
  if (!voucher) return rejection(rowNumber, "INVALID_VOUCHER", "Voucher reference is invalid");

  return {
    rowNumber,
    occurredAt,
    merchant,
    amount: amount.value,
    currency,
    chargedAmount: chargedAmount.value,
    chargedCurrency,
    sourceReferenceHash: await sha256(voucher),
  };
}

function isRejectedRow(row: ParsedImportRow | RejectedImportRow): row is RejectedImportRow {
  return "code" in row;
}

async function readWorkbook(file: File | Blob | ArrayBuffer): Promise<Sheet[]> {
  try {
    return await readXlsxFile(file, { trim: false });
  } catch {
    throw new CreditCardXlsxAdapterError("INVALID_WORKBOOK");
  }
}

export async function parseCreditCardXlsx(file: File | Blob | ArrayBuffer): Promise<ParsedImportFile> {
  const sheets = await readWorkbook(file);
  if (sheets.length !== 1) throw new CreditCardXlsxAdapterError("MULTIPLE_SHEETS");

  const sheet = sheets[0].data;
  const headerIndex = sheet.findIndex(isHeaderRow);
  if (headerIndex === -1) throw new CreditCardXlsxAdapterError("HEADERS_NOT_FOUND");

  const dataRows = sheet.slice(headerIndex + 1);
  if (dataRows.length > MAX_DATA_ROWS) throw new CreditCardXlsxAdapterError("ROW_LIMIT_EXCEEDED");

  const rows: ParsedImportRow[] = [];
  const rejected: RejectedImportRow[] = [];
  let chargedTotalScaled = 0n;

  for (const [index, row] of dataRows.entries()) {
    if (row.length === 0 || isSummaryRow(row)) continue;

    const parsed = await parseDataRow(row, headerIndex + index + 2);
    if (isRejectedRow(parsed)) {
      rejected.push(parsed);
    } else {
      rows.push(parsed);
      chargedTotalScaled += decimalToScaled(parsed.chargedAmount) ?? 0n;
    }
  }

  const dates = rows.map(({ occurredAt }) => occurredAt).sort();
  const currencies = [...new Set(rows.map(({ currency }) => currency))].sort();

  return {
    adapter: IMPORT_ADAPTER_ID,
    rows,
    rejected,
    dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
    currencies,
    chargedTotal: Number(chargedTotalScaled) / Number(MONEY_SCALE),
  };
}

export const creditCardXlsxAdapter: ImportFileAdapter = {
  adapter: IMPORT_ADAPTER_ID,
  parse: parseCreditCardXlsx,
};
