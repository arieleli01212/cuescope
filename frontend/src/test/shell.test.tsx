import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { LoginScreen } from "../components/LoginScreen";
import { Nav } from "../components/Nav";
import App from "../App";
import { STORAGE_KEY } from "../api";
import { creditCardXlsxAdapter } from "../import/creditCardXlsxAdapter";

vi.mock("../import/creditCardXlsxAdapter", () => ({
  creditCardXlsxAdapter: { adapter: "credit-card-xlsx-v1", parse: vi.fn() },
}));

it("submits a trimmed API key from the premium login", async () => {
  const onLogin = vi.fn();
  const user = userEvent.setup();
  render(<LoginScreen onLogin={onLogin} error={null} />);

  await user.type(screen.getByLabelText("מפתח API"), "  secret-key  ");
  await user.click(screen.getByRole("button", { name: "כניסה מאובטחת" }));

  expect(onLogin).toHaveBeenCalledWith("secret-key");
});

it("marks the active navigation destination", () => {
  render(<Nav active="summary" onChange={() => undefined} />);

  expect(screen.getByRole("button", { name: /סיכום/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it("shows the deployed CalVer version once /health responds", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ok",
          version: "2026.08.26-101530",
          commit: "a1b2c3d",
          buildTime: "2026-08-26T10:15:30Z",
        }),
    }),
  );

  render(<Nav active="summary" onChange={() => undefined} />);

  const badge = await screen.findByText("גרסה 2026.08.26-101530");
  expect(badge).toBeInTheDocument();
  expect(badge).toHaveAttribute("title", "a1b2c3d • נבנה: 2026-08-26T10:15:30Z");
  const mobileFooter = screen.getByTestId("mobile-version-footer");
  expect(mobileFooter).toHaveTextContent(
    `גרסה 2026.08.26-101530 · © ${new Date().getFullYear()} CueScope · Apache-2.0`,
  );
  expect(mobileFooter).toHaveClass("basis-full", "md:hidden");
  expect(fetch).toHaveBeenCalledWith("/health");

  vi.unstubAllGlobals();
});

it("hides the version badge when /health is unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

  render(<Nav active="summary" onChange={() => undefined} />);

  await Promise.resolve();
  expect(screen.queryByText(/^גרסה /)).not.toBeInTheDocument();
  expect(screen.getByTestId("mobile-version-footer")).toHaveTextContent(
    `© ${new Date().getFullYear()} CueScope · Apache-2.0`,
  );

  vi.unstubAllGlobals();
});

const importParsedRow = {
  rowNumber: 2,
  occurredAt: "2026-08-02T00:00:00.000Z",
  merchant: "Demo Shop",
  amount: 10,
  currency: "USD" as const,
  chargedAmount: 37.5,
  chargedCurrency: "ILS" as const,
  sourceReferenceHash: "a".repeat(64),
};

const importParsedFile = {
  adapter: "credit-card-xlsx-v1" as const,
  rows: [importParsedRow],
  rejected: [],
  dateRange: { from: importParsedRow.occurredAt, to: importParsedRow.occurredAt },
  currencies: ["USD" as const],
  chargedTotal: 37.5,
};

const importPreviewData = {
  adapter: "credit-card-xlsx-v1" as const,
  validCount: 1,
  duplicateCount: 0,
  rejected: [],
  merchantGroups: [
    {
      key: "demo shop",
      displayName: "Demo Shop",
      rowCount: 1,
      suggestedCategoryId: "other",
      suggestionSource: "fallback" as const,
    },
  ],
};

const importConfirmData = {
  id: "batch-1",
  adapter: "credit-card-xlsx-v1" as const,
  importedCount: 1,
  skippedCount: 0,
  rejectedCount: 0,
};

function jsonResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function setupAppFetch(overrides: Record<string, () => Response> = {}) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    const key = `${method} ${url}`;
    if (overrides[key]) return overrides[key]();
    if (url === "/health") return jsonResponse(200, {});
    if (url === "/v1/me" && method === "GET") return jsonResponse(200, { data: { name: "Ariel" } });
    if (url === "/v1/categories" && method === "GET") {
      return jsonResponse(200, { data: [{ id: "groceries", name: "מכולת" }, { id: "other", name: "אחר" }] });
    }
    if (url.startsWith("/v1/transactions/summary") && method === "GET") {
      return jsonResponse(200, { data: { totalIncome: 0, totalExpense: 0, balance: 0, byCategory: [], byGroup: [] } });
    }
    if (url.startsWith("/v1/transactions?") && method === "GET") return jsonResponse(200, { data: [] });

    throw new Error(`Unhandled fetch in test: ${key}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

async function renderLoggedInApp(overrides: Record<string, () => Response> = {}) {
  localStorage.setItem(STORAGE_KEY, "test-key");
  const fetchState = setupAppFetch(overrides);
  render(<App />);
  await screen.findByText("שלום, Ariel");
  return fetchState;
}

async function openImportSheetWithPreview(calls: FetchCall[]) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "עסקאות" }));
  await user.click(await screen.findByRole("button", { name: "ייבוא קובץ" }));

  const dialog = await screen.findByRole("dialog", { name: "ייבוא קובץ" });
  const file = new File([new Uint8Array(10)], "statement.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await user.upload(within(dialog).getByLabelText("בחירת קובץ ייבוא"), file);
  await screen.findByRole("region", { name: "סיכום קובץ" });

  const previewCall = calls.find((call) => call.url === "/v1/imports/preview");
  return { user, dialog, previewCall };
}

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  vi.unstubAllGlobals();
  vi.mocked(creditCardXlsxAdapter.parse).mockReset();
});

it("posts the normalized parsed rows to /imports/preview when a statement is uploaded", async () => {
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(importParsedFile);
  const { calls } = await renderLoggedInApp({
    "POST /v1/imports/preview": () => jsonResponse(200, { data: importPreviewData }),
  });

  const { previewCall } = await openImportSheetWithPreview(calls);

  expect(previewCall?.body).toEqual({
    adapter: "credit-card-xlsx-v1",
    rows: importParsedFile.rows,
    categoryMappings: {},
  });
});

it("confirms the import, posts to /imports, and refreshes transactions/summary/categories", async () => {
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(importParsedFile);
  const { calls } = await renderLoggedInApp({
    "POST /v1/imports/preview": () => jsonResponse(200, { data: importPreviewData }),
    "POST /v1/imports": () => jsonResponse(201, { data: importConfirmData }),
  });

  const { user } = await openImportSheetWithPreview(calls);
  const categoriesBefore = calls.filter((call) => call.url === "/v1/categories").length;
  const summaryBefore = calls.filter((call) => call.url.startsWith("/v1/transactions/summary")).length;
  const listBefore = calls.filter((call) => call.url.startsWith("/v1/transactions?")).length;

  await user.click(screen.getByRole("button", { name: "המשך" }));
  await user.click(await screen.findByRole("button", { name: "אישור ייבוא" }));

  await screen.findByText(/יובאו 1 עסקאות/);
  const confirmCall = calls.find((call) => call.url === "/v1/imports" && call.method === "POST");
  expect(confirmCall?.body).toEqual({
    adapter: "credit-card-xlsx-v1",
    rows: importParsedFile.rows,
    categoryMappings: { "demo shop": "other" },
    rejectedRows: [],
  });

  await waitFor(() => {
    expect(calls.filter((call) => call.url === "/v1/categories").length).toBeGreaterThan(categoriesBefore);
    expect(calls.filter((call) => call.url.startsWith("/v1/transactions/summary")).length).toBeGreaterThan(summaryBefore);
    expect(calls.filter((call) => call.url.startsWith("/v1/transactions?")).length).toBeGreaterThan(listBefore);
  });
});

it("undoes a confirmed import by calling DELETE /imports/:id and refreshing again", async () => {
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(importParsedFile);
  const { calls } = await renderLoggedInApp({
    "POST /v1/imports/preview": () => jsonResponse(200, { data: importPreviewData }),
    "POST /v1/imports": () => jsonResponse(201, { data: importConfirmData }),
    "DELETE /v1/imports/batch-1": () => jsonResponse(204),
  });

  const { user } = await openImportSheetWithPreview(calls);
  await user.click(screen.getByRole("button", { name: "המשך" }));
  await user.click(await screen.findByRole("button", { name: "אישור ייבוא" }));
  await screen.findByText(/יובאו 1 עסקאות/);

  const summaryBefore = calls.filter((call) => call.url.startsWith("/v1/transactions/summary")).length;
  await user.click(screen.getByRole("button", { name: "ביטול הייבוא" }));

  await waitFor(() => {
    expect(calls.some((call) => call.url === "/v1/imports/batch-1" && call.method === "DELETE")).toBe(true);
    expect(calls.filter((call) => call.url.startsWith("/v1/transactions/summary")).length).toBeGreaterThan(summaryBefore);
  });
});

it("returns to the login screen when an import request is unauthorized", async () => {
  vi.mocked(creditCardXlsxAdapter.parse).mockResolvedValue(importParsedFile);
  await renderLoggedInApp({
    "POST /v1/imports/preview": () => jsonResponse(401),
  });

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "עסקאות" }));
  await user.click(await screen.findByRole("button", { name: "ייבוא קובץ" }));
  const dialog = await screen.findByRole("dialog", { name: "ייבוא קובץ" });
  const file = new File([new Uint8Array(10)], "statement.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await user.upload(within(dialog).getByLabelText("בחירת קובץ ייבוא"), file);

  await screen.findByRole("button", { name: "כניסה מאובטחת" });
});
