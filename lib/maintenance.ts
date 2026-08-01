/**
 * Maintenance window. Preferred source: data/maintenance.json (toggled by
 * scripts/maintenance.sh + pm2 restart). Env vars are a fallback.
 *
 *   { "locked": true, "warning": false, "message": "...", "eta": "...", "warnUntil": null }
 */

import { existsSync, readFileSync } from "fs";
import path from "path";

export type MaintenanceStatus = {
  locked: boolean;
  warning: boolean;
  message: string;
  eta: string | null;
  warnUntil: string | null;
};

const DEFAULT_MESSAGE =
  "Сейчас на сайте технические работы: обновляю библиотеку. Это не сбой — скоро всё снова откроется.";

const FILE = path.join(process.cwd(), "data", "maintenance.json");

type FileShape = {
  locked?: boolean;
  message?: string;
  eta?: string | null;
  warnUntil?: string | null;
};

function readFileStatus(): Partial<FileShape> | null {
  try {
    if (!existsSync(FILE)) return null;
    return JSON.parse(readFileSync(FILE, "utf8")) as FileShape;
  } catch {
    return null;
  }
}

function isTruthy(value: string | undefined) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function getMaintenanceStatus(): MaintenanceStatus {
  const file = readFileStatus();
  const locked = file?.locked ?? isTruthy(process.env.MAINTENANCE_MODE);
  const message = (file?.message || process.env.MAINTENANCE_MESSAGE || DEFAULT_MESSAGE).trim();
  const eta = (file?.eta || process.env.MAINTENANCE_ETA || "").trim() || null;
  const warnUntil =
    (file?.warnUntil || process.env.MAINTENANCE_WARN_UNTIL || "").trim() || null;

  let warning = false;
  if (!locked && warnUntil) {
    const ts = Date.parse(warnUntil);
    if (!Number.isNaN(ts) && ts > Date.now()) warning = true;
  }

  return { locked, warning, message, eta, warnUntil };
}

/** Values to inject into the PM2 process env (so Edge middleware sees them). */
export function maintenanceEnvFromFile(): Record<string, string> {
  const s = getMaintenanceStatus();
  return {
    MAINTENANCE_MODE: s.locked ? "1" : "0",
    MAINTENANCE_MESSAGE: s.message,
    MAINTENANCE_ETA: s.eta || "",
    MAINTENANCE_WARN_UNTIL: s.warnUntil || "",
  };
}
