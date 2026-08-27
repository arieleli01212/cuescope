import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { vi } from "vitest";

import { CategoriesTab } from "../components/CategoriesTab";
import type { Category } from "../types";

const categories: Category[] = [
  { id: "coffee", name: "קפה", group: "אוכל" },
  { id: "restaurants", name: "מסעדות", group: " אוכל " },
  { id: "transport", name: "תחבורה", group: "נסיעות" },
  { id: "misc", name: "שונות", group: null },
];

function renderCategories(overrides: Partial<React.ComponentProps<typeof CategoriesTab>> = {}) {
  const props = {
    categories,
    onUpdateGroup: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onCreate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  const view = render(
    <StrictMode>
      <CategoriesTab {...props} />
    </StrictMode>,
  );
  return { props, ...view };
}

it("renders stable grouped headings and category counts", () => {
  renderCategories();

  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "אוכל",
    "נסיעות",
    "ללא נושא",
  ]);
  expect(screen.getByRole("heading", { name: "אוכל" }).closest("section")).toHaveTextContent("2 קטגוריות");
  expect(screen.getByRole("heading", { name: "נסיעות" }).closest("section")).toHaveTextContent("קטגוריה אחת");
});

it("saves a changed group on blur and shows saving then saved feedback", async () => {
  vi.useFakeTimers();
  let resolveUpdate!: () => void;
  const onUpdateGroup = vi.fn().mockImplementation(
    () => new Promise<void>((resolve) => { resolveUpdate = resolve; }),
  );

  try {
    const { rerender, props } = renderCategories({ onUpdateGroup });
    const input = screen.getByRole("textbox", { name: "נושא עבור קפה" });
    fireEvent.change(input, { target: { value: " בתי קפה " } });
    fireEvent.blur(input);

    expect(onUpdateGroup).toHaveBeenCalledWith("coffee", "בתי קפה");
    expect(screen.getByText("שומר…")).toBeVisible();

    rerender(
      <StrictMode>
        <CategoriesTab
          {...props}
          categories={categories.map((category) => (
            category.id === "coffee" ? { ...category, group: "בתי קפה" } : category
          ))}
        />
      </StrictMode>,
    );
    await act(async () => resolveUpdate());
    expect(screen.getByText("נשמר")).toBeVisible();

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText("נשמר")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("renders concise idle feedback without announcing it as a live update", () => {
  renderCategories();

  const idleFeedback = screen.getAllByText("מוכן");
  expect(idleFeedback).toHaveLength(categories.length);
  idleFeedback.forEach((feedback) => expect(feedback).toHaveAttribute("aria-hidden", "true"));
  screen.getAllByRole("status").forEach((status) => expect(status).toHaveTextContent(""));
});

it("does not save an unchanged trimmed group and keeps save errors visible", async () => {
  const user = userEvent.setup();
  const onUpdateGroup = vi.fn().mockRejectedValue(new Error("שמירת הנושא נכשלה"));
  renderCategories({ onUpdateGroup });

  const unchanged = screen.getByRole("textbox", { name: "נושא עבור קפה" });
  await user.clear(unchanged);
  await user.type(unchanged, "  אוכל  ");
  await user.tab();
  expect(onUpdateGroup).not.toHaveBeenCalled();

  const failing = screen.getByRole("textbox", { name: "נושא עבור תחבורה" });
  await user.clear(failing);
  await user.type(failing, "רכב");
  await user.tab();

  expect(await screen.findByRole("alert")).toHaveTextContent("שמירת הנושא נכשלה");
});

it("shows useful fallback messages for non-Error category rejections", async () => {
  const user = userEvent.setup();
  renderCategories({ onUpdateGroup: vi.fn().mockRejectedValue("rejected") });

  const input = screen.getByRole("textbox", { name: "נושא עבור קפה" });
  await user.clear(input);
  await user.type(input, "בתי קפה");
  await user.tab();

  expect(await screen.findByRole("alert")).toHaveTextContent("שמירת הנושא נכשלה");
});

it("requires explicit confirmation before deletion and surfaces backend errors", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn().mockRejectedValue(new Error("לא ניתן למחוק קטגוריה עם עסקאות"));
  renderCategories({ onDelete });

  await user.click(screen.getByRole("button", { name: "מחיקת קפה" }));
  const dialog = screen.getByRole("alertdialog", { name: "מחיקת קטגוריה" });
  expect(onDelete).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole("button", { name: "אישור מחיקה" }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("לא ניתן למחוק קטגוריה עם עסקאות");
});

it("locks deletion while pending and closes only after the single request resolves", async () => {
  const user = userEvent.setup();
  let resolveDelete!: () => void;
  const onDelete = vi.fn().mockImplementation(
    () => new Promise<void>((resolve) => { resolveDelete = resolve; }),
  );
  renderCategories({ onDelete });

  await user.click(screen.getByRole("button", { name: "מחיקת קפה" }));
  const dialog = screen.getByRole("alertdialog", { name: "מחיקת קטגוריה" });
  const confirmation = within(dialog).getByRole("button", { name: "אישור מחיקה" });
  await user.click(confirmation);

  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole("button", { name: "מוחק…" })).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "מוחק…" }));
  expect(onDelete).toHaveBeenCalledTimes(1);

  await act(async () => resolveDelete());
  expect(screen.queryByRole("alertdialog", { name: "מחיקת קטגוריה" })).not.toBeInTheDocument();
});

it("clears an active saved-feedback timer on unmount", async () => {
  vi.useFakeTimers();
  try {
    const { unmount } = renderCategories();
    const input = screen.getByRole("textbox", { name: "נושא עבור קפה" });
    fireEvent.change(input, { target: { value: "בתי קפה" } });
    fireEvent.blur(input);
    await act(async () => undefined);

    expect(screen.getByText("נשמר")).toBeVisible();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps category creation functional", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  renderCategories({ onCreate });

  await user.type(screen.getByRole("textbox", { name: "שם קטגוריה חדשה" }), " ביטוח ");
  await user.type(screen.getByRole("textbox", { name: "נושא לקטגוריה חדשה" }), " קבועות ");
  await user.click(screen.getByRole("button", { name: "הוספת קטגוריה" }));

  expect(onCreate).toHaveBeenCalledWith("ביטוח", "קבועות");
  expect(screen.getByRole("textbox", { name: "שם קטגוריה חדשה" })).toHaveValue("");
});
