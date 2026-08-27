import { LogOut, Sparkles, UserRound } from "lucide-react";

import { Button } from "./ui/button";

interface TopBarProps {
  whoami: string;
  title: string;
  onLogout: () => void;
}

export function TopBar({ whoami, title, onLogout }: TopBarProps) {
  return (
    <header className="sticky top-0 z-[5] flex min-h-16 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{title}</span>
        </div>
        <p className="m-0 mt-0.5 hidden truncate text-sm text-muted sm:block">
          כל מה שחשוב, במקום אחד
        </p>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface-raised text-primary">
            <UserRound aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="max-w-24 truncate text-xs sm:max-w-44 sm:text-sm">{whoami}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onLogout}
          aria-label="התנתקות"
          title="התנתקות"
          className="h-11 w-11 rounded-xl border border-border text-muted hover:text-text"
        >
          <LogOut aria-hidden="true" className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
