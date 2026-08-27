import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { LoginScreen } from "../components/LoginScreen";
import { Nav } from "../components/Nav";

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
