import { useEffect, useState } from "react";

interface VersionInfo {
  version: string;
  commit: string;
  buildTime: string | null;
}

// /health אינו מאחורי /v1 ולא דורש X-API-Key (ר' backend/src/app.ts), אז
// הפנייה כאן היא fetch ישיר ולא דרך api() שבקובץ ../api.ts.
export function useVersion(): VersionInfo | null {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/health")
      .then((res) => (res.ok ? (res.json() as Promise<Partial<VersionInfo>>) : null))
      .then((data) => {
        if (
          !cancelled &&
          data &&
          typeof data.version === "string" &&
          typeof data.commit === "string"
        ) {
          setInfo({
            version: data.version,
            commit: data.commit,
            buildTime: data.buildTime ?? null,
          });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
