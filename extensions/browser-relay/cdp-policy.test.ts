import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedCdpMethod } from "./chrome-extension/cdp-policy.js";

test("allows tab-scoped DevTools capabilities", () => {
  for (const method of [
    "Runtime.evaluate",
    "Network.enable",
    "Tracing.start",
    "HeapProfiler.takeHeapSnapshot",
    "Page.handleJavaScriptDialog",
    "DOM.setFileInputFiles",
    "Input.dispatchMouseEvent",
    "Emulation.setDeviceMetricsOverride",
  ]) {
    assert.equal(isAllowedCdpMethod(method), true, method);
  }
});

test("blocks browser-wide DevTools capabilities", () => {
  for (const method of [
    "Browser.close",
    "Target.getTargets",
    "Storage.getCookies",
    "Network.getAllCookies",
    "Network.clearBrowserCookies",
    "Extensions.uninstall",
  ]) {
    assert.equal(isAllowedCdpMethod(method), false, method);
  }
});
