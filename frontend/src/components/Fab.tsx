import { Plus } from "lucide-react";

interface FabProps {
  onClick: (opener: HTMLButtonElement) => void;
}

export function Fab({ onClick }: FabProps) {
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      aria-label="הוספת עסקה"
      aria-haspopup="dialog"
      title="הוספת עסקה"
      className="
        fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] end-6 z-[6]
        grid h-14 w-14 place-items-center rounded-2xl border border-primary/35 bg-primary text-bg
        shadow-glow transition duration-premium hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-none
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-bg
        max-md:bottom-[calc(5.75rem+env(safe-area-inset-bottom))] max-md:end-4
      "
    >
      <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={2.25} />
    </button>
  );
}
