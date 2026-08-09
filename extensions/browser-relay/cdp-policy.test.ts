import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedCdpEvent,
  isAllowedCdpMethod,
} from "./chrome-extension/cdp-policy.js";

test("allows tab-scoped DevTools capabilities", () => {
  for (const method of [
    "Runtime.evaluate",
    "Network.enable",
    "HeapProfiler.startSampling",
    "Page.handleJavaScriptDialog",
    "DOM.setFileInputFiles",
    "Input.dispatchMouseEvent",
    "Emulation.setDeviceMetricsOverride",
  ]) {
    assert.equal(isAllowedCdpMethod(method), true, method);
  }
});

test("captures events only from reviewed tab-scoped domains", () => {
  assert.equal(isAllowedCdpEvent("Network.requestWillBeSent"), true);
  assert.equal(isAllowedCdpEvent("Runtime.consoleAPICalled"), true);
  assert.equal(isAllowedCdpEvent("HeapProfiler.addHeapSnapshotChunk"), true);
  assert.equal(isAllowedCdpEvent("Tracing.dataCollected"), false);
  assert.equal(isAllowedCdpEvent("Target.targetCreated"), false);
});

test("blocks browser-wide DevTools capabilities", () => {
  for (const method of [
    "Browser.close",
    "Target.getTargets",
    "Storage.getCookies",
    "Tracing.start",
    "Tracing.requestMemoryDump",
    "Page.crash",
    "Page.deleteCookie",
    "Page.navigate",
    "Page.setDownloadBehavior",
    "Page.navigateToHistoryEntry",
    "Page.captureSnapshot",
    "Page.getResourceContent",
    "Page.printToPDF",
    "DOMSnapshot.captureSnapshot",
    "DOMSnapshot.getSnapshot",
    "Network.getResponseBody",
    "Network.getResponseBodyForInterception",
    "Fetch.getResponseBody",
    "HeapProfiler.takeHeapSnapshot",
    "HeapProfiler.startTrackingHeapObjects",
    "Fetch.takeResponseBodyAsStream",
    "Network.getAllCookies",
    "Network.clearBrowserCookies",
    "Extensions.uninstall",
  ]) {
    assert.equal(isAllowedCdpMethod(method), false, method);
  }
});
