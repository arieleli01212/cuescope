import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ImportTransactionsSheet } from "../components/ImportTransactionsSheet";
import type { Category, Currency, ImportPreview, ImportResult } from "../types";
import { creditCardXlsxAdapter } from "../import/creditCardXlsxAdapter";

vi.mock("../import/creditCardXlsxAdapter", () => ({
  creditCardXlsxAdapter: { adapter: "credit-card-xlsx-v1", parse: vi.fn() },
}));

const groceries: Category = { id: "groceries", name: "מכולת" };
const other: Category = { id: "other", name: "אחר" };

const parsedRow = {
  rowNumber: 2,
  occurredAt: "2026-08-02T00:00:00.000Z",
  merchant: "Demo Shop",
  amount: 10,
  currency: "USD" as const,
  chargedAmount: 37.5,
  chargedCurrency: "ILS" as const,
  sourceReferenceHash: "a".repeat(64),
};

function parsedFile(overrides: Partial<Awaited<ReturnType<typeof creditCardXlsxAdapter.parse>>> = {}) {
  return {
    adapter: "credit-card-xlsx-v1" as const,
    rows: [parsedRow],
    rejected: [],
    dateRange: { from: parsedRow.occurredAt, to: parsedRow.occurredAt },
    currencies: ["USD"] as Currency[],
    chargedTotal: 37.5,
    ...overrides,
  };
}

function previewResponse(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    adapter: "credit-card-xlsx-v1",
    validCount: 1,
    duplicateCount: 0,
    rejected: [],
    merchantGroups: [
      { key: "demo shop", displayName: "Demo Shop", rowCount: 1, suggestedCategoryId: "other", suggestionSource: "fallback" },
    ],
    ...overrides,
  };
}

function confirmResponse(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    id: "batch-1",
    adapter: "credit-card-xlsx-v1",
    importedCount: 1,
    skippedCount: 0,
    rejectedCount: 0,
    ...overrides,
  };
}

function renderSheet(overrides: Partial<React.ComponentProps<typeof ImportTransactionsSheet>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    categories: [groceries, other],
    onPreview: vi.fn().mockResolvedValue(previewResponse()),
    onConfirm: vi.fn().mockResolvedValue(confirmResponse()),
    onUndo: vi.fn().mockResolvedValue(undefined),
    onImported: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ImportTransactionsSheet {...props} />);
  return props;
}

function xlsxFile(name = "statement.xlsx", size = 1024) {
  const file = new File([new Uint8Array(size)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return file;
}

beforeEach(() => {
  vi.mocked(creditCardXlsxAdapter.parse).mockReset();
});

it("renders an accessible dialog whose file input accepts only XLSX", () => {
  renderSheet();

  const dialog = screen.getByRole("dialog", { name: "ייבוא קובץ" });
  const input = within(dialog).getByLabelText("בחירת קובץ ייבוא") as HTMLInputElement;
  expect(input).toHaveAttribute("accept", ".xlsx");
});

it("rejects an oversized file before parsing", async () => {
  const user = userEvent.setup();
  renderSheet();

  const oversized = xlsxFile("statement.xlsx", 5 * 1024 * 1024 + 1);
  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), oversized);

  expect(await screen.findByRole("alert")).toHaveTextContent(/5/);
  expect(creditCardXlsxAdapter.parse).not.toHaveBeenCalled();
});

it("rejects a non-XLSX file extension before parsing", async () => {
  // applyAccept: false bypasses the input's `accept=".xlsx"` browser-level
  // filtering so this test can exercise our own defense-in-depth JS check
  // (real drag-and-drop or an "all files" picker can still bypass `accept`).
  const user = userEvent.setup({ applyAccept: false });
  renderSheet();

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile("statement.csv"));

  expect(await screen.findByRole("alert")).toHaveTextContent("XLSX");
  expect(creditCardXlsxAdapter.parse).not.toHaveBeenCalled();
});

it("shows a parsing loading state and disables the import trigger while parsing", async () => {
  const user = userEvent.setup();
  let resolveParse!: (value: ReturnType<typeof parsedFile>) => void;
  vi.mocked(creditCardXlsxAdapter.parse).mockImplementation(
    () => new Promise((resolve) => { resolveParse = resolve; }),
  );
  renderSheet();

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile());

  expect(screen.getByText("מעבד את הקובץ…")).toBeVisible();
  expect(screen.getByLabelText("בחירת קובץ ייבוא")).toBeDisabled();

  await waitFor(() => resolveParse(parsedFile()));
});

it("shows the preview summary with counts, date range, currencies, and charged total", async () => {
  const user = userEvent.setup();
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(parsedFile());
  renderSheet({ onPreview: vi.fn().mockResolvedValue(previewResponse({ validCount: 1, duplicateCount: 2 })) });

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile());

  const summary = await screen.findByRole("region", { name: "סיכום קובץ" });
  expect(within(summary).getByText("1")).toBeVisible();
  expect(within(summary).getByText("2")).toBeVisible();
  expect(within(summary).getByText("USD")).toBeVisible();
  expect(within(summary).getByText(/37.5/)).toBeVisible();
});

it("groups unknown merchants once and defaults their category to the server suggestion", async () => {
  const user = userEvent.setup();
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(parsedFile({
    rows: [parsedRow, { ...parsedRow, rowNumber: 3 }],
  }));
  renderSheet({
    onPreview: vi.fn().mockResolvedValue(previewResponse({
      merchantGroups: [
        { key: "demo shop", displayName: "Demo Shop", rowCount: 2, suggestedCategoryId: "groceries", suggestionSource: "history" },
      ],
    })),
  });

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile());

  expect(await screen.findAllByText("Demo Shop")).toHaveLength(1);
  expect(screen.getByRole("combobox", { name: "Demo Shop" })).toHaveTextContent("מכולת");
});

it("shows a visible count of merchant groups without a historical or explicit mapping", async () => {
  const user = userEvent.setup();
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(parsedFile());
  renderSheet({
    onPreview: vi.fn().mockResolvedValue(previewResponse({
      merchantGroups: [
        { key: "demo shop", displayName: "Demo Shop", rowCount: 1, suggestedCategoryId: "other", suggestionSource: "fallback" },
      ],
    })),
  });

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile());

  expect(await screen.findByText("1 בתי עסק ללא שיוך קודם, ישויכו ל\"אחר\"")).toBeVisible();
});

it("labels an AI-suggested category so the user knows to double-check it", async () => {
  const user = userEvent.setup();
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(parsedFile());
  renderSheet({
    onPreview: vi.fn().mockResolvedValue(previewResponse({
      merchantGroups: [
        { key: "demo shop", displayName: "Demo Shop", rowCount: 1, suggestedCategoryId: "groceries", suggestionSource: "ai" },
      ],
    })),
  });

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile());

  expect(await screen.findByText(/הצעת AI/)).toBeVisible();
  // An AI suggestion isn't counted as "unmapped" - it already has a category.
  expect(screen.queryByText(/ללא שיוך קודם/)).not.toBeInTheDocument();
});

it("shows rejected rows with only their row number and reason", async () => {
  const user = userEvent.setup();
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(parsedFile({
    rejected: [{ rowNumber: 5, code: "INVALID_DATE", message: "Purchase date is invalid" }],
  }));
  renderSheet();

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile());

  const rejectedList = await screen.findByRole("list", { name: "שורות שנדחו" });
  expect(within(rejectedList).getByText(/5/)).toBeVisible();
  expect(within(rejectedList).getByText("Purchase date is invalid")).toBeVisible();
});

it("disables the confirm import action while confirming and requires an explicit final review step", async () => {
  const user = userEvent.setup();
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(parsedFile());
  let resolveConfirm!: (value: ImportResult) => void;
  const onConfirm = vi.fn().mockImplementation(() => new Promise<ImportResult>((resolve) => { resolveConfirm = resolve; }));
  renderSheet({ onConfirm });

  await user.upload(screen.getByLabelText("בחירת קובץ ייבוא"), xlsxFile());
  await screen.findByRole("region", { name: "סיכום קובץ" });

  await user.click(screen.getByRole("button", { name: "המשך" }));
  expect(onConfirm).not.toHaveBeenCalled();

  const confirmButton = await screen.findByRole("button", { name: "אישור ייבוא" });
  await user.click(confirmButton);

  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "מייבא…" })).toBeDisabled();

  await waitFor(() => resolveConfirm(confirmResponse()));
  expect(await screen.findByText(/יובאו/)).toBeVisible();
});
