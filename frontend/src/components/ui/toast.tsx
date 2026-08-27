import { CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "../../lib/utils";

interface ToastStatusProps {
  message: string | null;
  variant?: "success" | "error";
  className?: string;
}

export function ToastStatus({ message, variant = "success", className }: ToastStatusProps) {
  if (!message) return null;

  const isError = variant === "error";
  const Icon = isError ? CircleAlert : CheckCircle2;

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3.5 py-3 text-sm",
        isError
          ? "border-critical/35 bg-critical/10 text-critical"
          : "border-primary/30 bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
