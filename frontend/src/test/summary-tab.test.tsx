import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { SummaryTab } from "../components/SummaryTab";
import type { Summary } from "../types";

vi.mock("react-chartjs-2", () => ({
  Bar: () => <div data-testid="bar-chart" />,
  Doughnut: () => <div data-testid="doughnut-chart" />,
}));

const summary: Summary = {
  totalIncome: 18200,
  totalExpense: 5720,
  balance: 12480,
  byCategory: [
    { name: "מזון", expense: 3000 },
    { name: "תחבורה", expense: 1720 },
    { name: "בילויים", expense: 1000 },
  ],
  byGroup: [
    { name: "מחיה", expense: 4720 },
    { name: "פנאי", expense: 1000 },
  ],
};

const defaultProps = {
  month: "2026-08",
  onMonthChange: vi.fn(),
  loading: false,
  error: null,
  summary,
};

it("renders the premium monthly summary and accessible chart descriptions", () => {
  render(<SummaryTab {...defaultProps} />);

  expect(
    screen.getByRole("heading", { name: "תמונת מצב חודשית" }),
  ).toBeInTheDocument();
  expect(screen.getByText("₪12,480.00")).toBeInTheDocument();
  expect(screen.getByText("₪18,200.00")).toBeInTheDocument();
  expect(screen.getByText("₪5,720.00")).toBeInTheDocument();
  expect(screen.getByLabelText(/מזון: 3000\.00/)).toBeInTheDocument();
});

it("renders three accessible KPI skeleton cards while loading", () => {
  render(<SummaryTab {...defaultProps} loading summary={null} />);

  expect(screen.getAllByRole("status", { name: /טוען נתון/ })).toHaveLength(3);
  document.querySelectorAll(".animate-pulse").forEach((skeleton) => {
    expect(skeleton).toHaveClass("motion-reduce:animate-none");
  });
});

it("exposes rich empty-chart text without a generic image label", () => {
  render(<SummaryTab {...defaultProps} summary={{
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    byCategory: [],
    byGroup: [],
  }} />);

  expect(screen.getByText("אין עדיין תנועות בחודש הזה. הוספת עסקה תציג כאן את ההשוואה.")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("renders summary errors as an alert", () => {
  render(
    <SummaryTab
      {...defaultProps}
      error="שגיאה בטעינת הסיכום"
      summary={null}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("שגיאה בטעינת הסיכום");
});
