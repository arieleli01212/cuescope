import type { Sheet } from "read-excel-file/browser";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CREDIT_CARD_XLSX_HEADERS,
  CreditCardXlsxAdapterError,
  parseCreditCardXlsx,
} from "../import/creditCardXlsxAdapter";

const readXlsxFileMock = vi.hoisted(() => vi.fn());

vi.mock("read-excel-file/browser", () => ({ default: readXlsxFileMock }));

let actualReadXlsxFile: typeof import("read-excel-file/browser").default;

beforeAll(async () => {
  actualReadXlsxFile = (await vi.importActual<typeof import("read-excel-file/browser")>(
    "read-excel-file/browser",
  )).default;
});

beforeEach(() => {
  readXlsxFileMock.mockReset();
  readXlsxFileMock.mockImplementation(actualReadXlsxFile);
});

async function syntheticWorkbook(): Promise<ArrayBuffer> {
  const { readFile } = await vi.importActual<{
    readFile(path: string): Promise<Uint8Array>;
  }>("node:fs/promises");
  const testProcess = await vi.importActual<{ cwd(): string }>("node:process");
  const bytes = await readFile(
    `${testProcess.cwd()}/src/test/fixtures/credit-card-statement.synthetic.xlsx`,
  );
  return new Uint8Array(bytes).buffer;
}

function mockSheets(data: Sheet["data"], count = 1): void {
  readXlsxFileMock.mockResolvedValue(
    Array.from({ length: count }, (_, index) => ({ sheet: `Synthetic ${index + 1}`, data })),
  );
}

describe("creditCardXlsxAdapter", () => {
  test("detects the exact Hebrew headers after preamble and parses only normalized fields", async () => {
    const parsed = await parseCreditCardXlsx(await syntheticWorkbook());

    expect(parsed).toEqual({
      adapter: "credit-card-xlsx-v1",
      rows: [
        {
          rowNumber: 4,
          occurredAt: "2026-08-02T00:00:00.000Z",
          merchant: "Demo Grocery",
          amount: 100.1,
          currency: "ILS",
          chargedAmount: 100.1,
          chargedCurrency: "ILS",
          sourceReferenceHash: "0ebf68cae190a958c1bf0b31bac2e19b4a42584794fcfe87ad9e9aa0f758c0b1",
        },
        {
          rowNumber: 5,
          occurredAt: "2026-08-03T00:00:00.000Z",
          merchant: "Demo Books",
          amount: 12.34,
          currency: "USD",
          chargedAmount: 45.67,
          chargedCurrency: "ILS",
          sourceReferenceHash: "d0496b0d823d6240ff1bbb09c3bbc1ee4c30f35b6dd6f73ee79ccddc9715b312",
        },
        {
          rowNumber: 6,
          occurredAt: "2026-07-31T00:00:00.000Z",
          merchant: "Demo Cafe",
          amount: 5,
          currency: "EUR",
          chargedAmount: 20.2,
          chargedCurrency: "ILS",
          sourceReferenceHash: "c34d09ebd09b8e4287914dfd7865c98a06aa089b8d30a54da6598b63b953236a",
        },
      ],
      rejected: [
        { rowNumber: 7, code: "INVALID_DATE", message: "Purchase date is invalid" },
        { rowNumber: 8, code: "INVALID_AMOUNT", message: "Transaction amount must be positive" },
        { rowNumber: 9, code: "INVALID_AMOUNT", message: "Transaction amount must be positive" },
        { rowNumber: 10, code: "UNSUPPORTED_CURRENCY", message: "Transaction currency is unsupported" },
      ],
      dateRange: {
        from: "2026-07-31T00:00:00.000Z",
        to: "2026-08-03T00:00:00.000Z",
      },
      currencies: ["EUR", "ILS", "USD"],
      chargedTotal: 165.97,
    });

    for (const row of parsed.rows) {
      expect(Object.keys(row).sort()).toEqual([
        "amount",
        "chargedAmount",
        "chargedCurrency",
        "currency",
        "merchant",
        "occurredAt",
        "rowNumber",
        "sourceReferenceHash",
      ]);
    }
    for (const rejection of parsed.rejected) {
      expect(rejection.code).toMatch(/^[A-Z][A-Z0-9_]{0,63}$/);
      expect(Object.keys(rejection).sort()).toEqual(["code", "message", "rowNumber"]);
    }

    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("FAKE-");
    expect(serialized).not.toContain("PRIVATE-");
    expect(serialized).not.toContain("synthetic-card-statement.xlsx");
  });

  test("requires one sheet and the exact eight-header sequence", async () => {
    const validHeader: string[] = [...CREDIT_CARD_XLSX_HEADERS];
    mockSheets([[...validHeader, "unexpected ninth header"]]);
    await expect(parseCreditCardXlsx(new Blob())).rejects.toMatchObject({
      code: "HEADERS_NOT_FOUND",
    } satisfies Partial<CreditCardXlsxAdapterError>);

    const changedHeader = [...validHeader];
    changedHeader[1] = "שם עסק";
    mockSheets([changedHeader]);
    await expect(parseCreditCardXlsx(new Blob())).rejects.toMatchObject({
      code: "HEADERS_NOT_FOUND",
    } satisfies Partial<CreditCardXlsxAdapterError>);

    mockSheets([validHeader], 2);
    await expect(parseCreditCardXlsx(new Blob())).rejects.toMatchObject({
      code: "MULTIPLE_SHEETS",
    } satisfies Partial<CreditCardXlsxAdapterError>);
  });

  test("parses dot-separated two-digit-year dates (DD.MM.YY) as well as DD/MM/YYYY", async () => {
    mockSheets([
      [...CREDIT_CARD_XLSX_HEADERS],
      ["26.08.26", "Demo Shop", 42, "₪", 42, "₪", "V-1", ""],
    ]);

    const parsed = await parseCreditCardXlsx(new Blob());

    expect(parsed.rejected).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].occurredAt).toBe("2026-08-26T00:00:00.000Z");
  });

  test("recognizes the ₪ currency symbol as ILS for both transaction and charged currency", async () => {
    mockSheets([
      [...CREDIT_CARD_XLSX_HEADERS],
      ["26/08/2026", "Demo Shop", 42, "₪", 42, "₪", "V-1", ""],
    ]);

    const parsed = await parseCreditCardXlsx(new Blob());

    expect(parsed.rejected).toEqual([]);
    expect(parsed.rows[0].currency).toBe("ILS");
    expect(parsed.rows[0].chargedCurrency).toBe("ILS");
  });

  test("counts footer-shaped rows toward the 5,000-row parser cap", async () => {
    const footer = ["סה״כ לחיוב", null, null, null, 1, "ש״ח"];
    mockSheets([
      ["arbitrary preamble"],
      [...CREDIT_CARD_XLSX_HEADERS],
      ...Array.from({ length: 5_001 }, () => footer),
    ]);

    await expect(parseCreditCardXlsx(new Blob())).rejects.toMatchObject({
      code: "ROW_LIMIT_EXCEEDED",
    } satisfies Partial<CreditCardXlsxAdapterError>);
  });
});
