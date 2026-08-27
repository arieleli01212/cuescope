import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Alert, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";

it("renders accessible shared primitives", () => {
  render(
    <Card>
      <CardTitle>מאזן</CardTitle>
      <Button>הוספת עסקה</Button>
    </Card>,
  );
  expect(screen.getByRole("heading", { name: "מאזן" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "הוספת עסקה" })).toBeEnabled();
});

it("runs a tab consumer click handler without overriding internal selection", async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">אחד</TabsTrigger>
        <TabsTrigger value="two" onClick={onClick}>שתיים</TabsTrigger>
      </TabsList>
    </Tabs>,
  );

  const second = screen.getByRole("tab", { name: "שתיים" });
  await user.click(second);
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(second).toHaveAttribute("aria-selected", "true");
});

it("does not ship unsupported dialog animation utility classes", () => {
  render(
    <>
      <Dialog open><DialogContent><DialogTitle>דיאלוג</DialogTitle></DialogContent></Dialog>
      <Sheet open><SheetContent><SheetTitle>מגירה</SheetTitle></SheetContent></Sheet>
    </>,
  );

  document.querySelectorAll("[data-state]").forEach((element) => {
    expect(element.className).not.toMatch(/animate-(?:in|out)/);
  });
});

it("keeps alert titles hierarchy-neutral", () => {
  render(<Alert><AlertTitle>שגיאה נקודתית</AlertTitle></Alert>);
  expect(screen.getByText("שגיאה נקודתית").tagName).toBe("DIV");
});

it("reserves RTL start-side space for the sheet close control", () => {
  render(<SheetHeader data-testid="sheet-header">כותרת</SheetHeader>);
  expect(screen.getByTestId("sheet-header")).toHaveClass("ps-10");
  expect(screen.getByTestId("sheet-header")).not.toHaveClass("pe-10");
});
