const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isLoopbackOrigin = () =>
  typeof window !== "undefined" && LOOPBACK_HOSTNAMES.has(window.location.hostname);

export const isBrowserOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false && !isLoopbackOrigin();

export const isBrowserOnline = () => !isBrowserOffline();
