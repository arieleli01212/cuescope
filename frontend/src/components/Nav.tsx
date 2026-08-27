import { LayoutDashboard, Plus, ReceiptText, Tags, WalletCards } from "lucide-react";
import { useVersion } from "../hooks/useVersion";

export type Tab = "summary" | "list" | "categories" | "add";

const TABS: Array<{ id: Tab; label: string; Icon: typeof LayoutDashboard }> = [
  { id: "summary", label: "סיכום", Icon: LayoutDashboard },
  { id: "list", label: "עסקאות", Icon: ReceiptText },
  { id: "categories", label: "קטגוריות", Icon: Tags },
  { id: "add", label: "הוספה", Icon: Plus },
];

interface NavProps {
  active: Tab;
  addOpen?: boolean;
  onChange: (tab: Tab, opener: HTMLButtonElement) => void;
}

export function Nav({ active, addOpen = false, onChange }: NavProps) {
  const version = useVersion();
  const currentYear = new Date().getFullYear();

  return (
    <nav
      aria-label="ניווט ראשי"
      className="
        flex w-[232px] shrink-0 flex-col gap-1 overflow-x-hidden border-e border-border bg-surface/90 px-3 py-5 backdrop-blur-xl
        md:sticky md:top-0 md:h-screen md:pb-5
        max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:w-full max-md:flex-row max-md:flex-wrap
        max-md:z-[5] max-md:justify-around max-md:border-e-0 max-md:border-t
        max-md:px-1 max-md:pb-[calc(6px+env(safe-area-inset-bottom))] max-md:pt-1.5
      "
    >
      <div className="mb-7 flex items-center gap-3 px-2 max-md:hidden">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-glow">
          <WalletCards aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="m-0 text-sm font-semibold tracking-[0.12em] text-text">CueScope</p>
          <p className="m-0 mt-0.5 text-[11px] text-muted">רואים את התמונה המלאה</p>
        </div>
      </div>

      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === "add" ? addOpen : active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={(event) => onChange(id, event.currentTarget)}
            aria-current={isActive ? (id === "add" ? "true" : "page") : undefined}
            aria-haspopup={id === "add" ? "dialog" : undefined}
            aria-expanded={id === "add" ? addOpen : undefined}
            className={
              "group relative flex min-h-11 min-w-0 items-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-start text-sm transition-colors duration-premium " +
              "max-md:flex-1 max-md:flex-col max-md:gap-0.5 max-md:px-1 max-md:py-2 max-md:text-center max-md:text-[11px] " +
              (isActive
                ? "bg-primary/[0.12] font-semibold text-primary shadow-[inset_0_0_0_1px_rgba(45,212,167,0.18)]"
                : "text-muted hover:bg-surface-raised hover:text-text")
            }
          >
            <span className={"absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary transition-opacity max-md:inset-x-3 max-md:bottom-auto max-md:top-0 max-md:h-0.5 max-md:w-auto " + (isActive ? "opacity-100" : "opacity-0")} />
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="truncate max-md:max-w-full">{label}</span>
          </button>
        );
      })}

      <p
        data-testid="mobile-version-footer"
        className="m-0 basis-full truncate px-2 text-center text-[9px] leading-tight text-muted md:hidden"
      >
        {version && (
          <>
            גרסה <bdi dir="ltr">{version.version}</bdi>
            <span aria-hidden="true"> · </span>
          </>
        )}
        © {currentYear} CueScope<span aria-hidden="true"> · </span>Apache-2.0
      </p>

      {version && (
        <p
          className="mt-auto truncate px-2 pt-3 text-[11px] text-muted max-md:hidden"
          title={`${version.commit}${version.buildTime ? ` • נבנה: ${version.buildTime}` : ""}`}
        >
          גרסה {version.version}
        </p>
      )}
    </nav>
  );
}
