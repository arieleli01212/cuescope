import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { vi } from "vitest";

import { AddTransactionSheet } from "../components/AddTransactionTab";
import { Fab } from "../components/Fab";
import { Nav, type Tab } from "../components/Nav";
import type { Category } from "../types";

const category: Category = { id: "groceries", name: "מכולת" };

function renderSheet(overrides: Partial<React.ComponentProps<typeof AddTransactionSheet>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    categories: [category],
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onCreateCategory: vi.fn().mockResolvedValue({ id: "new-category", name: "ביטוח" }),
    ...overrides,
  };
  render(<AddTransactionSheet {...props} />);
  return props;
}

it("renders the controlled sheet as an accessible transaction form", () => {
  renderSheet();

  const dialog = screen.getByRole("dialog", { name: "הוספת עסקה" });
  expect(within(dialog).getByRole("group", { name: "סוג עסקה" })).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "הוצאה" })).toHaveAttribute("aria-pressed", "true");
  expect(within(dialog).getByRole("button", { name: "הכנסה" })).toHaveAttribute("aria-pressed", "false");
  expect(within(dialog).getByLabelText("סכום")).toBeVisible();
  expect(within(dialog).getByLabelText("קטגוריה")).toBeVisible();
  expect(within(dialog).getByLabelText("מטבע")).toBeVisible();
  expect(within(dialog).getByLabelText("הערה (אופציונלי)")).toBeVisible();
});

it("submits the existing payload, reports success, resets values, and stays open", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const props = renderSheet({ onSubmit });

  await user.type(screen.getByLabelText("סכום"), "125.50");
  await user.type(screen.getByLabelText("הערה (אופציונלי)"), "  קנייה שבועית  ");
  await user.click(screen.getByRole("button", { name: "שמירה" }));

  expect(onSubmit).toHaveBeenCalledWith({
    type: "EXPENSE",
    amount: 125.5,
    currency: "ILS",
    categoryId: "groceries",
    note: "קנייה שבועית",
  });
  expect(await screen.findByRole("status")).toHaveTextContent("העסקה נשמרה");
  expect(screen.getByLabelText("סכום")).toHaveValue(null);
  expect(screen.getByLabelText("הערה (אופציונלי)")).toHaveValue("");
  expect(screen.getByRole("dialog", { name: "הוספת עסקה" })).toBeVisible();
  expect(props.onOpenChange).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "סגירה" }));
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("keeps entered values and exposes the error when submission fails", async () => {
  const user = userEvent.setup();
  renderSheet({ onSubmit: vi.fn().mockRejectedValue(new Error("השרת לא זמין")) });

  await user.type(screen.getByLabelText("סכום"), "48");
  await user.type(screen.getByLabelText("הערה (אופציונלי)"), "קפה");
  await user.click(screen.getByRole("button", { name: "שמירה" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("השרת לא זמין");
  expect(screen.getByLabelText("סכום")).toHaveValue(48);
  expect(screen.getByLabelText("הערה (אופציונלי)")).toHaveValue("קפה");
});

it("disables the form while pending and blocks duplicate submission", async () => {
  const user = userEvent.setup();
  let resolveSubmit!: () => void;
  const onSubmit = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveSubmit = resolve; }));
  renderSheet({ onSubmit });

  await user.type(screen.getByLabelText("סכום"), "20");
  const submit = screen.getByRole("button", { name: "שמירה" });
  await user.click(submit);

  expect(screen.getByRole("button", { name: "שומר…" })).toBeDisabled();
  expect(screen.getByLabelText("סכום")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "שומר…" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);

  await act(async () => resolveSubmit());
});

it("refuses close, Escape, and outside dismissal while a transaction is pending", async () => {
  const user = userEvent.setup();
  let resolveSubmit!: () => void;
  const onSubmit = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveSubmit = resolve; }));
  const props = renderSheet({ onSubmit });

  await user.type(screen.getByLabelText("סכום"), "20");
  await user.click(screen.getByRole("button", { name: "שמירה" }));

  const close = screen.getByRole("button", { name: "סגירה" });
  expect(close).toBeDisabled();
  await user.keyboard("{Escape}");
  const overlay = document.querySelector<HTMLElement>('[data-state="open"][aria-hidden="true"]');
  expect(overlay).not.toBeNull();
  fireEvent.pointerDown(overlay!);
  fireEvent.click(overlay!);
  await user.click(screen.getByRole("button", { name: "שומר…" }));

  expect(props.onOpenChange).not.toHaveBeenCalled();
  expect(onSubmit).toHaveBeenCalledTimes(1);

  await act(async () => resolveSubmit());
  expect(close).not.toBeDisabled();
  await user.click(close);
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("restores focus to the exact opener after a controlled close", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [open, setOpen] = useState(false);
    const openerRef = useRef<HTMLButtonElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    return (
      <>
        <button
          ref={openerRef}
          type="button"
          onClick={() => {
            returnFocusRef.current = document.activeElement as HTMLElement;
            setOpen(true);
          }}
        >
          פתיחה מותאמת
        </button>
        <AddTransactionSheet
          open={open}
          onOpenChange={setOpen}
          returnFocusRef={returnFocusRef}
          categories={[category]}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
          onCreateCategory={vi.fn().mockResolvedValue(category)}
        />
      </>
    );
  }

  render(<Harness />);
  const opener = screen.getByRole("button", { name: "פתיחה מותאמת" });
  await user.click(opener);
  expect(screen.getByRole("dialog", { name: "הוספת עסקה" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "סגירה" }));

  await waitFor(() => expect(opener).toHaveFocus());
});

it.each([
  ["Nav", "הוספה"],
  ["FAB", "הוספת עסקה"],
] as const)("restores focus to the clicked %s trigger even when the click did not focus it", async (kind, accessibleName) => {
  const user = userEvent.setup();
  let focusAtOpen: Element | null = null;

  function Harness() {
    const [open, setOpen] = useState(false);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const openAdd = (opener: HTMLButtonElement) => {
      focusAtOpen = document.activeElement;
      returnFocusRef.current = opener;
      setOpen(true);
    };
    const onNavChange = (tab: Tab, opener?: HTMLButtonElement) => {
      if (tab === "add" && opener) openAdd(opener);
    };
    return (
      <>
        <input aria-label="מיקוד קודם" />
        {kind === "Nav"
          ? <Nav active="summary" onChange={onNavChange} />
          : <Fab onClick={openAdd} />}
        <AddTransactionSheet
          open={open}
          onOpenChange={setOpen}
          returnFocusRef={returnFocusRef}
          categories={[category]}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
          onCreateCategory={vi.fn().mockResolvedValue(category)}
        />
      </>
    );
  }

  render(<Harness />);
  const previous = screen.getByRole("textbox", { name: "מיקוד קודם" });
  previous.focus();
  const opener = screen.getByRole("button", { name: new RegExp(accessibleName) });
  fireEvent.click(opener);

  expect(focusAtOpen).toBe(previous);
  expect(screen.getByRole("dialog", { name: "הוספת עסקה" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "סגירה" }));
  await waitFor(() => expect(opener).toHaveFocus());
});

it("creates a category inline and selects the returned category", async () => {
  const user = userEvent.setup();
  const created = { id: "new-category", name: "ביטוח" };
  const onCreateCategory = vi.fn().mockResolvedValue(created);
  renderSheet({ onCreateCategory });

  await user.click(screen.getByRole("button", { name: "קטגוריה חדשה" }));
  await user.type(screen.getByRole("textbox", { name: "שם קטגוריה חדשה" }), "  ביטוח  ");
  await user.click(screen.getByRole("button", { name: "שמירת קטגוריה" }));

  expect(onCreateCategory).toHaveBeenCalledWith("ביטוח");
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "קטגוריה" })).toHaveTextContent("ביטוח");
  });
});

it("reconciles a removed authoritative selection to an available category", async () => {
  const second = { id: "transport", name: "תחבורה" };
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onCreateCategory: vi.fn().mockResolvedValue(category),
  };
  const { rerender } = render(<AddTransactionSheet {...props} categories={[category, second]} />);

  rerender(<AddTransactionSheet {...props} categories={[second]} />);

  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "קטגוריה" })).toHaveTextContent("תחבורה");
  });
});

it("retains a newly-created local selection until authoritative categories catch up", async () => {
  const user = userEvent.setup();
  const created = { id: "new-category", name: "ביטוח" };
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onCreateCategory: vi.fn().mockResolvedValue(created),
  };
  const { rerender } = render(<AddTransactionSheet {...props} categories={[category]} />);
  await user.click(screen.getByRole("button", { name: "קטגוריה חדשה" }));
  await user.type(screen.getByRole("textbox", { name: "שם קטגוריה חדשה" }), "ביטוח");
  await user.click(screen.getByRole("button", { name: "שמירת קטגוריה" }));

  rerender(<AddTransactionSheet {...props} categories={[category]} />);

  expect(screen.getByRole("combobox", { name: "קטגוריה" })).toHaveTextContent("ביטוח");
});
