const ALLOWED_COMMANDS = new Set([
  "Accessibility.disable",
  "Accessibility.enable",
  "Accessibility.getAXNodeAndAncestors",
  "Accessibility.getChildAXNodes",
  "Accessibility.getFullAXTree",
  "Accessibility.getPartialAXTree",
  "Accessibility.getRootAXNode",
  "Accessibility.queryAXTree",
  "Audits.checkContrast",
  "Audits.checkFormsIssues",
  "Audits.getEncodedResponse",
  "CSS.collectClassNames",
  "CSS.disable",
  "CSS.enable",
  "CSS.forcePseudoState",
  "CSS.getBackgroundColors",
  "CSS.getComputedStyleForNode",
  "CSS.getInlineStylesForNode",
  "CSS.getMatchedStylesForNode",
  "CSS.getMediaQueries",
  "CSS.getPlatformFontsForNode",
  "CSS.getStyleSheetText",
  "CSS.startRuleUsageTracking",
  "CSS.stopRuleUsageTracking",
  "CSS.takeCoverageDelta",
  "DOM.collectClassNamesFromSubtree",
  "DOM.describeNode",
  "DOM.disable",
  "DOM.discardSearchResults",
  "DOM.enable",
  "DOM.focus",
  "DOM.getAttributes",
  "DOM.getBoxModel",
  "DOM.getContentQuads",
  "DOM.getDocument",
  "DOM.getFlattenedDocument",
  "DOM.getNodeForLocation",
  "DOM.getOuterHTML",
  "DOM.getRelayoutBoundary",
  "DOM.getSearchResults",
  "DOM.hideHighlight",
  "DOM.highlightNode",
  "DOM.highlightRect",
  "DOM.markUndoableState",
  "DOM.moveTo",
  "DOM.performSearch",
  "DOM.querySelector",
  "DOM.querySelectorAll",
  "DOM.removeAttribute",
  "DOM.removeNode",
  "DOM.requestChildNodes",
  "DOM.requestNode",
  "DOM.resolveNode",
  "DOM.scrollIntoView",
  "DOM.scrollIntoViewIfNeeded",
  "DOM.setAttributeValue",
  "DOM.setAttributesAsText",
  "DOM.setFileInputFiles",
  "DOM.setNodeName",
  "DOM.setNodeStackTracesEnabled",
  "DOM.setNodeValue",
  "DOM.setOuterHTML",
  "DOM.undo",
  "DOMDebugger.getEventListeners",
  "DOMDebugger.getPossibleBreakpoints",
  "DOMDebugger.getTargets",
  "DOMDebugger.removeDOMBreakpoint",
  "DOMDebugger.removeEventListenerBreakpoint",
  "DOMDebugger.removeInstrumentationBreakpoint",
  "DOMDebugger.removeXHRBreakpoint",
  "DOMDebugger.setBreakOnCSPViolation",
  "DOMDebugger.setDOMBreakpoint",
  "DOMDebugger.setEventListenerBreakpoint",
  "DOMDebugger.setInstrumentationBreakpoint",
  "DOMDebugger.setXHRBreakpoint",
  "DOMSnapshot.disable",
  "DOMSnapshot.enable",
  "Emulation.canEmulate",
  "Emulation.clearDeviceMetricsOverride",
  "Emulation.clearGeolocationOverride",
  "Emulation.resetPageScaleFactor",
  "Emulation.setAutoDarkModeOverride",
  "Emulation.setCPUThrottlingRate",
  "Emulation.setDefaultBackgroundColorOverride",
  "Emulation.setDeviceMetricsOverride",
  "Emulation.setDevicePostureOverride",
  "Emulation.setDisabledImageTypes",
  "Emulation.setEmulatedMedia",
  "Emulation.setEmulatedVisionDeficiency",
  "Emulation.setFocusEmulationEnabled",
  "Emulation.setGeolocationOverride",
  "Emulation.setIdleOverride",
  "Emulation.setLocaleOverride",
  "Emulation.setNavigatorOverrides",
  "Emulation.setPageScaleFactor",
  "Emulation.setScriptExecutionDisabled",
  "Emulation.setScrollbarsHidden",
  "Emulation.setSensorOverrideEnabled",
  "Emulation.setSensorOverrideReadings",
  "Emulation.setTimezoneOverride",
  "Emulation.setTouchEmulationEnabled",
  "Emulation.setUserAgentOverride",
  "Emulation.setVirtualTimePolicy",
  "Emulation.setVisibleSize",
  "Fetch.continueRequest",
  "Fetch.continueResponse",
  "Fetch.continueWithAuth",
  "Fetch.disable",
  "Fetch.enable",
  "Fetch.failRequest",
  "Fetch.fulfillRequest",
  "HeapProfiler.collectGarbage",
  "HeapProfiler.disable",
  "HeapProfiler.enable",
  "HeapProfiler.getHeapObjectId",
  "HeapProfiler.getObjectByHeapObjectId",
  "HeapProfiler.getSamplingProfile",
  "HeapProfiler.startSampling",
  "HeapProfiler.stopSampling",
  "Input.dispatchDragEvent",
  "Input.dispatchKeyEvent",
  "Input.dispatchMouseEvent",
  "Input.dispatchTouchEvent",
  "Input.emulateTouchFromMouseEvent",
  "Input.insertText",
  "Input.synthesizePinchGesture",
  "Input.synthesizeScrollGesture",
  "Input.synthesizeTapGesture",
  "Log.clear",
  "Log.disable",
  "Log.enable",
  "Log.startViolationsReport",
  "Log.stopViolationsReport",
  "Network.canEmulateNetworkConditions",
  "Network.disable",
  "Network.emulateNetworkConditions",
  "Network.emulateNetworkConditionsByRule",
  "Network.enable",
  "Network.getCertificate",
  "Network.getRequestPostData",
  "Network.getSecurityIsolationStatus",
  "Network.replayXHR",
  "Network.searchInResponseBody",
  "Network.setBlockedURLs",
  "Network.setBypassServiceWorker",
  "Network.setCacheDisabled",
  "Network.setExtraHTTPHeaders",
  "Network.setUserAgentOverride",
  "Overlay.disable",
  "Overlay.enable",
  "Overlay.getGridHighlightObjectsForTest",
  "Overlay.getHighlightObjectForTest",
  "Overlay.hideHighlight",
  "Overlay.highlightFrame",
  "Overlay.highlightNode",
  "Overlay.highlightQuad",
  "Overlay.highlightRect",
  "Overlay.setInspectMode",
  "Overlay.setShowAdHighlights",
  "Overlay.setShowContainerQueryOverlays",
  "Overlay.setShowFlexOverlays",
  "Overlay.setShowGridOverlays",
  "Overlay.setShowHinge",
  "Overlay.setShowIsolatedElements",
  "Overlay.setShowScrollSnapOverlays",
  "Overlay.setShowViewSizeOnResize",
  "Page.addScriptToEvaluateOnNewDocument",
  "Page.captureScreenshot",
  "Page.createIsolatedWorld",
  "Page.disable",
  "Page.enable",
  "Page.getAppManifest",
  "Page.getFrameTree",
  "Page.getInstallabilityErrors",
  "Page.getLayoutMetrics",
  "Page.getNavigationHistory",
  "Page.getResourceTree",
  "Page.handleJavaScriptDialog",
  "Page.reload",
  "Page.removeScriptToEvaluateOnNewDocument",
  "Page.requestAppBanner",
  "Page.setBypassCSP",
  "Page.setDocumentContent",
  "Page.setFontFamilies",
  "Page.setFontSizes",
  "Page.setInterceptFileChooserDialog",
  "Page.setLifecycleEventsEnabled",
  "Page.stopLoading",
  "Performance.disable",
  "Performance.enable",
  "Performance.getMetrics",
  "Performance.setTimeDomain",
  "PerformanceTimeline.enable",
  "Profiler.disable",
  "Profiler.enable",
  "Profiler.setSamplingInterval",
  "Profiler.start",
  "Profiler.startPreciseCoverage",
  "Profiler.startTypeProfile",
  "Profiler.stop",
  "Profiler.stopPreciseCoverage",
  "Profiler.stopTypeProfile",
  "Profiler.takePreciseCoverage",
  "Profiler.takeTypeProfile",
  "Runtime.addBinding",
  "Runtime.awaitPromise",
  "Runtime.callFunctionOn",
  "Runtime.compileScript",
  "Runtime.disable",
  "Runtime.discardConsoleEntries",
  "Runtime.enable",
  "Runtime.evaluate",
  "Runtime.getIsolateId",
  "Runtime.getProperties",
  "Runtime.globalLexicalScopeNames",
  "Runtime.queryObjects",
  "Runtime.releaseObject",
  "Runtime.releaseObjectGroup",
  "Runtime.removeBinding",
  "Runtime.runIfWaitingForDebugger",
  "Runtime.runScript",
  "Schema.getDomains",
]);

const ALLOWED_EVENTS = new Set([
  "Accessibility.loadComplete",
  "Accessibility.nodesUpdated",
  "CSS.fontsUpdated",
  "CSS.mediaQueryResultChanged",
  "CSS.styleSheetAdded",
  "CSS.styleSheetChanged",
  "CSS.styleSheetRemoved",
  "DOM.attributeModified",
  "DOM.attributeRemoved",
  "DOM.characterDataModified",
  "DOM.childNodeCountUpdated",
  "DOM.childNodeInserted",
  "DOM.childNodeRemoved",
  "DOM.documentUpdated",
  "DOM.inlineStyleInvalidated",
  "DOM.setChildNodes",
  "Emulation.virtualTimeBudgetExpired",
  "Fetch.authRequired",
  "Fetch.requestPaused",
  "Log.entryAdded",
  "Network.dataReceived",
  "Network.loadingFailed",
  "Network.loadingFinished",
  "Network.requestServedFromCache",
  "Network.requestWillBeSent",
  "Network.resourceChangedPriority",
  "Network.responseReceived",
  "Network.webSocketCreated",
  "Page.domContentEventFired",
  "Page.fileChooserOpened",
  "Page.javascriptDialogClosed",
  "Page.javascriptDialogOpening",
  "Page.lifecycleEvent",
  "Page.loadEventFired",
  "PerformanceTimeline.timelineEventAdded",
  "Runtime.bindingCalled",
  "Runtime.consoleAPICalled",
  "Runtime.exceptionRevoked",
  "Runtime.exceptionThrown",
  "Runtime.executionContextCreated",
  "Runtime.executionContextDestroyed",
  "Runtime.executionContextsCleared",
]);

function safeUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:", "ws:", "wss:"]).has(url.protocol)) {
      return `${url.protocol}[redacted]`;
    }
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, "[redacted]");
    }
    url.hash = "";
    return url.href;
  } catch {
    return "[redacted-url]";
  }
}

function redactedHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.keys(value).map((name) => [name, "[redacted]"]),
  );
}

function safeRequest(value) {
  if (!value || typeof value !== "object") return {};
  return {
    url: safeUrl(value.url),
    method: value.method,
    headers: redactedHeaders(value.headers),
    hasPostData: value.hasPostData,
    initialPriority: value.initialPriority,
    referrerPolicy: value.referrerPolicy,
    isLinkPreload: value.isLinkPreload,
  };
}

function safeResponse(value) {
  if (!value || typeof value !== "object") return {};
  return {
    url: safeUrl(value.url),
    status: value.status,
    statusText: value.statusText,
    headers: redactedHeaders(value.headers),
    mimeType: value.mimeType,
    connectionReused: value.connectionReused,
    connectionId: value.connectionId,
    encodedDataLength: value.encodedDataLength,
    fromDiskCache: value.fromDiskCache,
    fromServiceWorker: value.fromServiceWorker,
    protocol: value.protocol,
    securityState: value.securityState,
  };
}

function redactedHeaderEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((header) => header && typeof header === "object")
    .map((header) => ({ name: header.name, value: "[redacted]" }));
}

export function isAllowedCdpMethod(method) {
  return ALLOWED_COMMANDS.has(method);
}

export function isAllowedCdpEvent(method) {
  return ALLOWED_EVENTS.has(method);
}

export function sanitizeCdpEvent(method, params) {
  if (!isAllowedCdpEvent(method)) return undefined;
  if (!params || typeof params !== "object") return params;
  if (method === "Network.requestWillBeSent") {
    return {
      requestId: params.requestId,
      loaderId: params.loaderId,
      documentURL: safeUrl(params.documentURL),
      request: safeRequest(params.request),
      timestamp: params.timestamp,
      wallTime: params.wallTime,
      type: params.type,
      frameId: params.frameId,
      hasUserGesture: params.hasUserGesture,
      redirectHasExtraInfo: params.redirectHasExtraInfo,
      redirectResponse: params.redirectResponse
        ? safeResponse(params.redirectResponse)
        : undefined,
    };
  }
  if (method === "Network.responseReceived") {
    return {
      requestId: params.requestId,
      loaderId: params.loaderId,
      timestamp: params.timestamp,
      type: params.type,
      response: safeResponse(params.response),
      hasExtraInfo: params.hasExtraInfo,
      frameId: params.frameId,
    };
  }
  if (method === "Network.webSocketCreated") {
    return { requestId: params.requestId, url: safeUrl(params.url) };
  }
  if (method === "Fetch.requestPaused") {
    return {
      requestId: params.requestId,
      request: safeRequest(params.request),
      frameId: params.frameId,
      resourceType: params.resourceType,
      responseErrorReason: params.responseErrorReason,
      responseStatusCode: params.responseStatusCode,
      responseStatusText: params.responseStatusText,
      responseHeaders: redactedHeaderEntries(params.responseHeaders),
      networkId: params.networkId,
      redirectedRequestId: params.redirectedRequestId,
    };
  }
  if (method === "Fetch.authRequired") {
    const challenge = params.authChallenge;
    return {
      requestId: params.requestId,
      request: safeRequest(params.request),
      frameId: params.frameId,
      resourceType: params.resourceType,
      authChallenge:
        challenge && typeof challenge === "object"
          ? {
              source: challenge.source,
              origin: safeUrl(challenge.origin),
              scheme: challenge.scheme,
              realm: challenge.realm,
            }
          : undefined,
    };
  }
  return params;
}
