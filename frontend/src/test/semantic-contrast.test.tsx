import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { AddTransactionTab } from "../components/AddTransactionTab";
import { TransactionRow } from "../components/TransactionRow";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const category = { id: "category-1", name: "מכולת" };

it("pairs primary and critical primitives with their dark semantic foregrounds", () => {
  render(
    <>
      <Button>פעולה ראשית</Button>
      <Button variant="destructive">מחיקה</Button>
      <Badge>הכנסה</Badge>
      <Badge variant="destructive">שגיאה</Badge>
    </>,
  );

  const primaryButton = screen.getByRole("button", { name: "פעולה ראשית" });
  expect(primaryButton).toHaveClass("bg-primary", "text-primary-foreground", "hover:bg-primary-dark");
  expect(primaryButton).not.toHaveClass("text-white");

  const criticalButton = screen.getByRole("button", { name: "מחיקה" });
  expect(criticalButton).toHaveClass("bg-critical", "text-critical-foreground");
  expect(criticalButton).not.toHaveClass("text-white");

  expect(screen.getByText("הכנסה")).toHaveClass("bg-primary", "text-primary-foreground");
  expect(screen.getByText("שגיאה")).toHaveClass("bg-critical", "text-critical-foreground");
});

it("uses semantic foregrounds for expense, income, and submit controls", async () => {
  const user = userEvent.setup();
  render(
    <AddTransactionTab
      categories={[category]}
      onSubmit={vi.fn()}
      onCreateCategory={vi.fn()}
    />,
  );

  const expense = screen.getByRole("button", { name: "הוצאה" });
  expect(expense).toHaveClass("bg-expense-ink", "text-expense-foreground");
  expect(expense).not.toHaveClass("text-white");

  await user.click(screen.getByRole("button", { name: "הכנסה" }));
  const income = screen.getByRole("button", { name: "הכנסה" });
  expect(income).toHaveClass("bg-primary", "text-primary-foreground");

  const submit = screen.getByRole("button", { name: "שמירה" });
  expect(submit).toHaveClass(
    "bg-primary",
    "text-primary-foreground",
    "hover:bg-primary-dark",
  );
});

it("uses the expense foreground for transaction edit submission", async () => {
  const user = userEvent.setup();
  render(
    <TransactionRow
      transaction={{
        id: "transaction-1",
        type: "EXPENSE",
        amount: 42,
        currency: "ILS",
        occurredAt: "2026-08-23T00:00:00.000Z",
        category,
        user: { name: "Demo User" },
      }}
      categories={[category]}
      locked={false}
      onSave={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "עריכה" }));
  const save = screen.getByRole("button", { name: "שמירה" });
  expect(save).toHaveClass("bg-expense-ink", "text-expense-foreground");
  expect(save).not.toHaveClass("text-white");
});
