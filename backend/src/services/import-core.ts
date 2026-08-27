import { createHash } from "node:crypto";

export const IMPORT_ADAPTER = "credit-card-xlsx-v1" as const;
export type ImportCurrency = "ILS" | "USD" | "EUR";

const MONEY_SCALE = 2;
const MONEY_MAX_SCALED = 999_999_999_999n;
const RATE_SCALE = 6;
const RATE_MAX_SCALED = 999_999_999_999n;

export interface FingerprintRow {
  adapter: typeof IMPORT_ADAPTER;
  occurredAt: string;
  merchant: string;
  amount: number;
  currency: ImportCurrency;
  chargedAmount: number;
  chargedCurrency: ImportCurrency;
  sourceReferenceHash: string;
}

export function canonicalMerchant(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("he-IL").replace(/\s+/g, " ");
}

export function normalizedMerchantKey(value: string | null | undefined): string | null {
  if (value == null) return null;
  return canonicalMerchant(value) || null;
}

function toScaledInteger(value: number, scale: number, label: string): bigint {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);

  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value.toString());
  if (!match) throw new Error(`${label} must be a decimal number`);

  const [, sign, whole, fraction = "", exponentText = "0"] = match;
  const digits = BigInt(`${whole}${fraction}`);
  const decimalPlaces = fraction.length - Number(exponentText);
  const shift = scale - decimalPlaces;
  let scaled: bigint;

  if (shift >= 0) {
    scaled = digits * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    if (digits % divisor !== 0n) throw new Error(`${label} exceeds ${scale} decimal places`);
    scaled = digits / divisor;
  }

  return sign === "-" ? -scaled : scaled;
}

function validatedMoney(value: number, label: string): bigint {
  const scaled = toScaledInteger(value, MONEY_SCALE, label);
  if (scaled <= 0n) throw new Error("Refunds and zero-value rows are unsupported");
  if (scaled > MONEY_MAX_SCALED) throw new Error(`${label} exceeds Decimal(12,2)`);
  return scaled;
}

function formatScaled(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, "0")}`;
}

function canonicalMoney(value: number, label: string): string {
  return formatScaled(validatedMoney(value, label), MONEY_SCALE);
}

export function computeImportFingerprint(userId: string, row: FingerprintRow): string {
  const canonical = [
    userId,
    row.adapter,
    row.occurredAt.slice(0, 10),
    canonicalMerchant(row.merchant),
    canonicalMoney(row.amount, "Amount"),
    row.currency,
    canonicalMoney(row.chargedAmount, "Charged amount"),
    row.chargedCurrency,
    row.sourceReferenceHash,
  ].join("\u001f");
  return createHash("sha256").update(canonical).digest("hex");
}

export function deriveStatementAmounts(
  input: {
    amount: number;
    currency: ImportCurrency;
    chargedAmount: number;
    chargedCurrency: ImportCurrency;
  },
  baseCurrency: ImportCurrency,
) {
  const amountScaled = validatedMoney(input.amount, "Amount");
  const chargedAmountScaled = validatedMoney(input.chargedAmount, "Charged amount");
  if (input.chargedCurrency !== baseCurrency) {
    throw new Error("Charged currency must match the CueScope base currency");
  }

  const rateFactor = 10n ** BigInt(RATE_SCALE);
  const rateNumerator = chargedAmountScaled * rateFactor;
  let rateScaled = rateNumerator / amountScaled;
  if ((rateNumerator % amountScaled) * 2n >= amountScaled) rateScaled += 1n;
  if (rateScaled < 1n) throw new Error("Exchange rate is below Decimal(12,6) minimum");
  if (rateScaled > RATE_MAX_SCALED) throw new Error("Exchange rate exceeds Decimal(12,6)");

  const exchangeRate = Number(formatScaled(rateScaled, RATE_SCALE));
  if (!Number.isFinite(exchangeRate)) throw new Error("Exchange rate must be finite");

  return {
    amount: Number(formatScaled(amountScaled, MONEY_SCALE)),
    amountBase: Number(formatScaled(chargedAmountScaled, MONEY_SCALE)),
    exchangeRate,
  };
}
