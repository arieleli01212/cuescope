import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface VersionInfo {
  version: string | null;
  commit: string;
  buildTime: string | null;
}

const FALLBACK_VERSION: VersionInfo = {
  version: null,
  commit: "dev",
  buildTime: null,
};

// scripts/deploy.sh writes dist/version.json (UTC CalVer, git short SHA, and
// UTC build time) right after the host build, so a deployed container always
// reports which release is live. Local/CI builds that never run deploy.sh fall
// back to "dev".
export function readVersionInfo(): VersionInfo {
  try {
    const raw = readFileSync(join(__dirname, "version.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<VersionInfo>;
    if (
      typeof parsed.version === "string" &&
      typeof parsed.commit === "string" &&
      (typeof parsed.buildTime === "string" || parsed.buildTime === null)
    ) {
      return {
        version: parsed.version,
        commit: parsed.commit,
        buildTime: parsed.buildTime ?? null,
      };
    }
    return FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}
