import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TransactionsTab } from "../components/TransactionsTab";
import type { Category, Transaction } from "../types";

const categories: Category[] = [
  { id: "food", name: "אוכל" },
  { id: "work", name: "עבודה" },
];

const transactions: Transaction[] = [
  {
    id: "expense-1",
    type: "EXPENSE",
    amount: 40,
    currency: "ILS",
    occurredAt: "2026-08-01T00:00:00.000Z",
    note: "קפה",
    merchant: "קפה נובה",
    category: categories[0],
    user: { name: "Demo User" },
  },
  {
    id: "income-1",
    type: "INCOME",
    amount: 1000,
    currency: "ILS",
    occurredAt: "2026-08-02T00:00:00.000Z",
    note: "משכורת",
    category: categories[1],
    user: { name: "Demo User" },
  },
];

function renderTransactions(overrides: Partial<React.ComponentProps<typeof TransactionsTab>> = {}) {
  const props = {
    month: "2026-08",
    onMonthChange: vi.fn(),
    transactions,
    categories,
    locked: false,
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onImportClick: vi.fn(),
    ...overrides,
  };

  render(<TransactionsTab {...props} />);
  return props;
}

it("filters transactions with free-text search", async () => {
  const user = userEvent.setup();
  renderTransactions();

  await user.type(screen.getByRole("searchbox", { name: "חיפוש עסקאות" }), "קפה");

  expect(screen.getByText("קפה")).toBeInTheDocument();
  expect(screen.queryByText("משכורת", { exact: false })).not.toBeInTheDocument();
});

it("filters transactions by income and expense", async () => {
  const user = userEvent.setup();
  renderTransactions();

  const incomeFilter = screen.getByRole("radio", { name: "הכנסות" });
  await user.click(incomeFilter);

  expect(incomeFilter).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText("משכורת", { exact: false })).toBeInTheDocument();
  expect(screen.queryByText("קפה", { exact: false })).not.toBeInTheDocument();
});

it("opens transaction editing in an accessible dialog", async () => {
  const user = userEvent.setup();
  renderTransactions();

  await user.click(screen.getAllByRole("button", { name: "עריכה" })[0]);

  const dialog = screen.getByRole("dialog", { name: "עריכת עסקה" });
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByLabelText("סכום")).toHaveValue(40);
});

it("shows an accessible import button that opens the import sheet", async () => {
  const user = userEvent.setup();
  const onImportClick = vi.fn();
  renderTransactions({ onImportClick });

  await user.click(screen.getByRole("button", { name: "ייבוא קובץ" }));
  expect(onImportClick).toHaveBeenCalledTimes(1);
});

it("requires explicit confirmation before deleting a transaction", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn().mockResolvedValue(undefined);
  renderTransactions({ onDelete });

  await user.click(screen.getAllByRole("button", { name: "מחיקה" })[0]);

  expect(screen.getByRole("alertdialog", { name: "מחיקת עסקה" })).toBeInTheDocument();
  expect(onDelete).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "אישור מחיקה" }));
  expect(onDelete).toHaveBeenCalledWith("expense-1");
});
