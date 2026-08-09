import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedCdpEvent,
  isAllowedCdpMethod,
  sanitizeCdpEvent,
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
  assert.equal(isAllowedCdpEvent("Network.requestWillBeSentExtraInfo"), false);
  assert.equal(isAllowedCdpEvent("Network.responseReceivedExtraInfo"), false);
  assert.equal(isAllowedCdpEvent("HeapProfiler.addHeapSnapshotChunk"), false);
  assert.equal(isAllowedCdpEvent("Tracing.dataCollected"), false);
  assert.equal(isAllowedCdpEvent("Target.targetCreated"), false);
});

test("redacts credentials and request bodies from network events", () => {
  const sanitized = sanitizeCdpEvent("Network.requestWillBeSent", {
    requestId: "one",
    documentURL: "https://user:password@example.com/path?token=secret#value",
    request: {
      url: "https://example.com/api?session=secret",
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        Cookie: "session=secret-cookie",
        Accept: "application/json",
      },
      postData: "password=hunter2",
      hasPostData: true,
    },
  });
  const text = JSON.stringify(sanitized);

  for (const secret of [
    "password",
    "secret",
    "secret-token",
    "secret-cookie",
    "hunter2",
  ]) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.match(text, /\[redacted\]/);
  assert.match(text, /POST/);
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
