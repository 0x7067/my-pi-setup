const TAB_SCOPED_DOMAINS = new Set([
  "Accessibility",
  "Audits",
  "CSS",
  "DOM",
  "DOMDebugger",
  "DOMSnapshot",
  "Emulation",
  "Fetch",
  "HeapProfiler",
  "Input",
  "Log",
  "Network",
  "Overlay",
  "Page",
  "Performance",
  "PerformanceTimeline",
  "Profiler",
  "Runtime",
  "Tracing",
]);

const GLOBAL_NETWORK_METHODS = new Set([
  "Network.clearBrowserCache",
  "Network.clearBrowserCookies",
  "Network.deleteCookies",
  "Network.getAllCookies",
  "Network.getCookies",
  "Network.setCookie",
  "Network.setCookies",
]);

export function isAllowedCdpMethod(method) {
  if (GLOBAL_NETWORK_METHODS.has(method)) return false;
  const separator = method.indexOf(".");
  return separator > 0 && TAB_SCOPED_DOMAINS.has(method.slice(0, separator));
}
