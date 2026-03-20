export function logInfo(message: string, meta?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[INFO] ${new Date().toISOString()} ${message}`, meta ?? "");
}

export function logWarn(message: string, meta?: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[WARN] ${new Date().toISOString()} ${message}`, meta ?? "");
}

export function logError(message: string, meta?: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${new Date().toISOString()} ${message}`, meta ?? "");
}

