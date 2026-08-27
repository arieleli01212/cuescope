import { useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck, WalletCards } from "lucide-react";

import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface LoginScreenProps {
  onLogin: (key: string) => void;
  error: string | null;
}

export function LoginScreen({ onLogin, error }: LoginScreenProps) {
  const [key, setKey] = useState("");

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = key.trim();
    if (trimmed) onLogin(trimmed);
  }

  return (
    <section className="premium-grid relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute start-[8%] top-[12%] h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[8%] end-[6%] h-64 w-64 rounded-full bg-cyan/10 blur-3xl" />

      <div className="relative z-[1] w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3 text-sm font-medium text-muted">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-glow">
            <WalletCards aria-hidden="true" className="h-5 w-5" />
          </span>
          <span>CueScope</span>
        </div>

        <Card className="premium-card rounded-3xl px-5 py-7 sm:px-8 sm:py-9">
          <div className="mb-7 text-center">
            <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
              <ShieldCheck aria-hidden="true" className="h-6 w-6" />
            </span>
            <h1 className="m-0 text-2xl font-semibold tracking-tight">הכסף שלך, בתמונה ברורה</h1>
            <p className="mx-auto mt-2 max-w-[310px] text-sm leading-6 text-muted">
              כניסה מאובטחת למרחב הפיננסי האישי שלך באמצעות מפתח API.
            </p>
          </div>

          <form className="space-y-4 text-start" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="api-key" className="inline-flex items-center gap-2">
                <KeyRound aria-hidden="true" className="h-4 w-4 text-primary" />
                מפתח API
              </Label>
              <Input
                id="api-key"
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="הדביקו את המפתח כאן"
                autoComplete="current-password"
                className="h-12 rounded-xl bg-bg/55 px-4"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-critical/25 bg-critical/10 px-3 py-2.5 text-sm text-critical">
                {error}
              </p>
            )}

            <Button type="submit" className="h-12 w-full gap-2 rounded-xl text-bg shadow-glow hover:shadow-none">
              כניסה מאובטחת
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            </Button>
          </form>

          <p className="mb-0 mt-5 text-center text-xs leading-5 text-muted">
            המפתח נשמר בדפדפן הזה בלבד ומשמש לתקשורת עם השרת.
          </p>
        </Card>
      </div>
    </section>
  );
}
