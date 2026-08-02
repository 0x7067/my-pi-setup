import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { type ChildProcess, spawn } from "node:child_process";

import { Type } from "@earendil-works/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionContext,
  getMarkdownTheme,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type Component,
  Container,
  Markdown,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";

const MESSAGE_TYPE = "a2a-room-message";
const STATUS_KEY = "a2a-room";
const WIDGET_KEY = "a2a-room-members";
const POLL_MS = 750;
const READY_TIMEOUT_MS = 15_000;
const SEND_TIMEOUT_MS = 30 * 60_000;

interface TranscriptEntry {
  seq: number;
  from: string;
  text: string;
}

interface TranscriptPage {
  entries: TranscriptEntry[];
  last_seq: number;
  members: string[];
}

interface MemberStatus {
  name: string;
  state: string;
  queued: number;
  last_error?: string;
}

interface RoomStatus {
  state: string;
  pending: number;
  active?: { member: string; hop: number };
  members: MemberStatus[];
}

interface PeerSection {
  from: string;
  text: string;
}

interface MessageDetails {
  from: string;
  seq?: number;
  kind: "peer" | "outbound" | "system";
  sections?: PeerSection[];
}

interface EntryDetails extends MessageDetails {
  content: string;
}

interface Runtime {
  cwd: string;
  baseURL: string;
  roomPort: number;
  agentPortBase: number;
  bin: string;
  child?: ChildProcess;
  startError?: Error;
  owned: boolean;
  ready: boolean;
  members: string[];
  lastSeq: number;
  pendingEntries: TranscriptEntry[];
  pollTimer?: ReturnType<typeof setInterval>;
  polling: boolean;
  stopping: boolean;
  ctx?: ExtensionContext;
}

let runtime: Runtime | undefined;

function projectHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function portsFor(
  cwd: string,
  attempt = 0,
): { roomPort: number; agentPortBase: number } {
  const slot = (projectHash(cwd) + attempt) % 2_500;
  const roomPort = 20_000 + slot * 8;
  return { roomPort, agentPortBase: roomPort + 1 };
}

function localMessage(
  pi: ExtensionAPI,
  from: string,
  content: string,
  kind: EntryDetails["kind"],
  seq?: number,
): void {
  pi.appendEntry<EntryDetails>(MESSAGE_TYPE, { from, content, kind, seq });
}

function deliverPeerBatch(pi: ExtensionAPI, entries: TranscriptEntry[]): void {
  if (entries.length === 0) return;
  const from = entries.length === 1 ? entries[0].from : "room";
  const content = entries
    .map((entry) => `[${entry.from}] ${entry.text}`)
    .join("\n\n");
  const deliverAs = runtime?.ctx && !runtime.ctx.isIdle() ? "steer" : undefined;
  const sections = entries.map((entry) => ({
    from: entry.from,
    text: entry.text,
  }));
  pi.sendMessage<MessageDetails>(
    {
      customType: MESSAGE_TYPE,
      content,
      display: true,
      details: { from, seq: entries.at(-1)?.seq, kind: "peer", sections },
    },
    { triggerTurn: true, deliverAs },
  );
}

async function getJSON<T>(url: string, timeout = 2_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function post(url: string, body?: unknown): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.trim() || `HTTP ${response.status}`);
  return text.trim();
}

async function roomIsCompatible(baseURL: string): Promise<boolean> {
  try {
    const page = await getJSON<TranscriptPage>(
      `${baseURL}transcript.json?since=0`,
    );
    return page.members.length > 0 && !page.members.includes("pi");
  } catch {
    return false;
  }
}

function clip(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > max
    ? `${singleLine.slice(0, max - 1)}…`
    : singleLine;
}

function renderStatus(rt: Runtime, status?: RoomStatus): void {
  const ctx = rt.ctx;
  if (!ctx || !ctx.hasUI) return;
  const theme = ctx.ui.theme;
  if (!rt.ready || !status) {
    ctx.ui.setStatus(STATUS_KEY, theme.fg("dim", "a2a starting…"));
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }
  const state = status.active
    ? theme.fg("accent", `a2a → ${status.active.member}`)
    : theme.fg("dim", `a2a · ${status.members.length} peers`);
  const queued =
    status.pending > 0 ? theme.fg("muted", ` · ${status.pending} queued`) : "";
  ctx.ui.setStatus(STATUS_KEY, state + queued);
  const busy = status.members.flatMap((member) => {
    const notes: string[] = [];
    if (member.state === "active") notes.push(theme.fg("accent", "working"));
    if (member.queued > 0)
      notes.push(theme.fg("muted", `${member.queued} queued`));
    if (member.last_error)
      notes.push(theme.fg("error", clip(member.last_error, 48)));
    if (notes.length === 0) return [];
    return [
      `${theme.fg("customMessageLabel", `@${member.name}`)} ${notes.join(theme.fg("dim", " · "))}`,
    ];
  });
  if (busy.length === 0) {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }
  ctx.ui.setWidget(
    WIDGET_KEY,
    [`${theme.fg("dim", "a2a")}  ${busy.join("   ")}`],
    { placement: "aboveEditor" },
  );
}

const BATCH_PREFIX = /^\[([^\]]+)\]\s*/;

function parseSections(content: string, fallback: string): PeerSection[] {
  const sections: { from: string; lines: string[] }[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(BATCH_PREFIX);
    if (match)
      sections.push({ from: match[1], lines: [line.slice(match[0].length)] });
    else if (sections.length > 0) sections.at(-1)!.lines.push(line);
    else sections.push({ from: fallback, lines: [line] });
  }
  return sections.map((section) => ({
    from: section.from,
    text: section.lines.join("\n").trim(),
  }));
}

function renderRoomEntry(
  details: MessageDetails,
  content: string,
  expanded: boolean,
  pad: number,
  theme: Theme,
): Component {
  const root = new Container();
  if (details.kind === "peer") {
    const sections =
      details.sections ??
      (details.from === "room"
        ? parseSections(content, details.from)
        : [{ from: details.from, text: content.replace(BATCH_PREFIX, "") }]);
    const markdownTheme = getMarkdownTheme();
    sections.forEach((section, index) => {
      if (index > 0) root.addChild(new Spacer(1));
      const label = theme.fg(
        "customMessageLabel",
        theme.bold(`@${section.from}`),
      );
      const seqNote =
        expanded && index === sections.length - 1 && details.seq !== undefined
          ? theme.fg("dim", `  #${details.seq}`)
          : "";
      root.addChild(new Text(label + seqNote, pad, 0));
      root.addChild(new Markdown(section.text, pad + 2, 0, markdownTheme));
    });
    return root;
  }
  if (details.kind === "outbound") {
    const body = expanded ? content : clip(content, 120);
    root.addChild(
      new Text(theme.fg("muted", "→ ") + theme.fg("dim", body), pad, 0),
    );
    return root;
  }
  if (content.includes("\n")) {
    root.addChild(new Text(theme.fg("muted", details.from), pad, 0));
    root.addChild(new Text(content, pad + 2, 0));
  } else {
    root.addChild(
      new Text(`${theme.fg("warning", details.from)} ${content}`, pad, 0),
    );
  }
  return root;
}

async function poll(
  pi: ExtensionAPI,
  rt: Runtime,
): Promise<RoomStatus | undefined> {
  if (!rt.ready || rt.polling || rt.stopping) return undefined;
  rt.polling = true;
  try {
    const [page, status] = await Promise.all([
      getJSON<TranscriptPage>(
        `${rt.baseURL}transcript.json?since=${rt.lastSeq}`,
      ),
      getJSON<RoomStatus>(`${rt.baseURL}status.json`),
    ]);
    if (page.last_seq < rt.lastSeq) rt.lastSeq = 0;
    for (const entry of page.entries) {
      if (entry.seq <= rt.lastSeq || entry.from === "pi") continue;
      rt.pendingEntries.push(entry);
    }
    rt.lastSeq = page.last_seq;
    rt.members = page.members;
    renderStatus(rt, status);
    if (
      !status.active &&
      status.pending === 0 &&
      rt.pendingEntries.length > 0
    ) {
      const entries = rt.pendingEntries.splice(0);
      deliverPeerBatch(pi, entries);
    }
    return status;
  } catch (error) {
    if (!rt.stopping && rt.ctx?.hasUI) {
      rt.ctx.ui.setStatus(
        STATUS_KEY,
        rt.ctx.ui.theme.fg("error", "a2a disconnected"),
      );
    }
  } finally {
    rt.polling = false;
  }
}

async function waitUntilReady(rt: Runtime): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await roomIsCompatible(rt.baseURL)) return;
    if (rt.startError) throw rt.startError;
    if (rt.child?.exitCode !== null)
      throw new Error(
        `sidecar exited with code ${rt.child?.exitCode ?? "unknown"}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`room did not become ready at ${rt.baseURL}`);
}

async function stopRuntime(rt: Runtime): Promise<void> {
  rt.stopping = true;
  if (rt.pollTimer) clearInterval(rt.pollTimer);
  rt.pollTimer = undefined;
  rt.ctx?.ui.setStatus(STATUS_KEY, undefined);
  rt.ctx?.ui.setWidget(WIDGET_KEY, undefined);
  if (rt.owned && rt.child && rt.child.exitCode === null) {
    rt.child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => rt.child?.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
}

async function startRuntime(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<Runtime> {
  if (runtime) await stopRuntime(runtime);
  const bin = process.env.A2A_BIN?.trim() || "a2a";
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { roomPort, agentPortBase } = portsFor(ctx.cwd, attempt);
    const baseURL = `http://127.0.0.1:${roomPort}/`;
    const rt: Runtime = {
      cwd: ctx.cwd,
      baseURL,
      roomPort,
      agentPortBase,
      bin,
      owned: false,
      ready: false,
      members: [],
      lastSeq: 0,
      pendingEntries: [],
      polling: false,
      stopping: false,
      ctx,
    };
    renderStatus(rt);
    if (await roomIsCompatible(baseURL)) {
      rt.ready = true;
      runtime = rt;
      break;
    }
    try {
      const logDir = join(ctx.cwd, ".a2a", "logs");
      mkdirSync(logDir, { recursive: true, mode: 0o700 });
      const log = openSync(
        join(logDir, "pi-extension-sidecar.log"),
        "a",
        0o600,
      );
      try {
        rt.child = spawn(
          bin,
          [
            "up",
            "--exclude",
            "pi",
            "--room-port",
            String(roomPort),
            "--agent-port-base",
            String(agentPortBase),
            "--parent-pid",
            String(process.pid),
            ctx.cwd,
          ],
          { cwd: ctx.cwd, stdio: ["ignore", log, log], env: process.env },
        );
        rt.child.once("error", (error) => {
          rt.startError = error;
        });
      } finally {
        closeSync(log);
      }
      rt.owned = true;
      await waitUntilReady(rt);
      rt.ready = true;
      runtime = rt;
      break;
    } catch (error) {
      lastError = error;
      await stopRuntime(rt);
    }
  }
  if (!runtime?.ready)
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? "unable to start room"));
  const baseline = await getJSON<TranscriptPage>(
    `${runtime.baseURL}transcript.json?since=0`,
  );
  runtime.lastSeq = baseline.last_seq;
  runtime.members = baseline.members;
  await poll(pi, runtime);
  runtime.pollTimer = setInterval(() => void poll(pi, runtime!), POLL_MS);
  return runtime;
}

async function dispatch(pi: ExtensionAPI, text: string): Promise<string> {
  const rt = runtime;
  if (!rt?.ready) throw new Error("A2A room is not ready");
  const initialSeq = rt.lastSeq;
  const result = await pi.exec(
    rt.bin,
    ["send", "--url", rt.baseURL, "--from", "pi", "--timeout", "30m", text],
    {
      cwd: rt.cwd,
      timeout: SEND_TIMEOUT_MS,
    },
  );
  if (result.code !== 0)
    throw new Error(result.stderr.trim() || `a2a send exited ${result.code}`);
  const deadline = Date.now() + SEND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await poll(pi, rt);
    const hasReply = rt.lastSeq >= initialSeq + 2;
    if (
      status &&
      !status.active &&
      status.pending === 0 &&
      hasReply &&
      rt.pendingEntries.length === 0
    ) {
      return result.stdout.trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("timed out waiting for the A2A room to settle");
}

function mentionedPeer(text: string, members: string[]): boolean {
  return members.some((name) =>
    new RegExp(`(^|\\s)@${name}(?=\\s|$|[,:;.!?])`, "i").test(text),
  );
}

function createMentionProvider(
  current: AutocompleteProvider,
  getMembers: () => string[],
): AutocompleteProvider {
  return {
    async getSuggestions(
      lines,
      cursorLine,
      cursorCol,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const before = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const match = before.match(/(?:^|\s)@([a-z0-9_-]*)$/i);
      if (!match)
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      const query = match[1].toLowerCase();
      const items: AutocompleteItem[] = getMembers()
        .filter((name) => name.startsWith(query))
        .map((name) => ({
          value: `@${name}`,
          label: `@${name}`,
          description: "A2A peer",
        }));
      if (options.signal.aborted || items.length === 0)
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      return { items, prefix: `@${match[1]}` };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}

export default function a2aRoom(pi: ExtensionAPI): void {
  let autocompleteRegistered = false;
  pi.registerMessageRenderer<MessageDetails>(
    MESSAGE_TYPE,
    (entry, options, theme) => {
      const details = entry.details ?? {
        from: "room",
        kind: "system" as const,
      };
      return renderRoomEntry(
        details,
        String(entry.content),
        options.expanded ?? false,
        options.outputPad ?? 1,
        theme,
      );
    },
  );
  pi.registerEntryRenderer<EntryDetails>(
    MESSAGE_TYPE,
    (entry, options, theme) => {
      const details = entry.data ?? {
        from: "room",
        content: "",
        kind: "system" as const,
      };
      return renderRoomEntry(
        details,
        details.content,
        options.expanded ?? false,
        1,
        theme,
      );
    },
  );

  pi.registerTool({
    name: "delegate_to_agent",
    label: "Delegate to A2A peer",
    description:
      "Delegate a task to one room peer (Claude, Codex, or Cursor) working in the current project.",
    promptSnippet: "Delegate focused project work to an A2A room peer.",
    parameters: Type.Object({
      agent: Type.String({
        description: "Room member name, such as claude, codex, or cursor",
      }),
      task: Type.String({
        description: "Complete task or question for the peer",
      }),
    }),
    async execute(_id, params) {
      const agent = params.agent.toLowerCase();
      if (!runtime?.members.includes(agent)) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown room peer ${agent}. Available: ${runtime?.members.join(", ") || "none"}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
      const prompt = `@${agent} ${params.task}`;
      localMessage(pi, "pi → room", prompt, "outbound");
      try {
        const summary = await dispatch(pi, prompt);
        return {
          content: [
            {
              type: "text",
              text:
                summary ||
                `Delegation to ${agent} completed; peer messages are in this Pi session.`,
            },
          ],
          details: undefined,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  });

  pi.registerCommand("room", {
    description: "Send a message to A2A peers (usage: /room @agent task)",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) return ctx.ui.notify("Usage: /room @agent task", "warning");
      localMessage(pi, "pi → room", text, "outbound");
      try {
        await dispatch(pi, text);
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });

  pi.registerCommand("room-status", {
    description: "Show A2A dispatcher and member status",
    handler: async (_args, ctx) => {
      if (!runtime?.ready)
        return ctx.ui.notify("A2A room is not ready", "warning");
      const status = await getJSON<RoomStatus>(`${runtime.baseURL}status.json`);
      const members = status.members
        .map((m) => `${m.name}:${m.state}${m.queued ? `+${m.queued}` : ""}`)
        .join("  ");
      ctx.ui.notify(
        `${status.state}; ${status.pending} queued; ${members}`,
        "info",
      );
    },
  });

  pi.registerCommand("room-agents", {
    description: "List available A2A peers",
    handler: async (_args, ctx) =>
      ctx.ui.notify(
        runtime?.members.map((name) => `@${name}`).join("  ") ||
          "No peers available",
        "info",
      ),
  });

  pi.registerCommand("room-stats", {
    description: "Show local delegation statistics",
    handler: async (args, ctx) => {
      if (!runtime) return ctx.ui.notify("A2A room is not ready", "warning");
      const since = args.trim() || "5d";
      const result = await pi.exec(
        runtime.bin,
        ["stats", "--url", runtime.baseURL, "--since", since],
        { cwd: runtime.cwd, timeout: 10_000 },
      );
      localMessage(
        pi,
        "room stats",
        result.stdout.trim() || result.stderr.trim(),
        "system",
      );
    },
  });

  pi.registerCommand("room-mark", {
    description:
      "Mark a peer result used or unused (usage: /room-mark <seq> used|unused)",
    handler: async (args, ctx) => {
      const [seqText, verdict] = args.trim().split(/\s+/);
      const seq = Number(seqText);
      if (
        !runtime ||
        !Number.isInteger(seq) ||
        seq < 1 ||
        !["used", "unused"].includes(verdict)
      ) {
        return ctx.ui.notify("Usage: /room-mark <seq> used|unused", "warning");
      }
      await post(`${runtime.baseURL}results/mark`, {
        transcript_seq: seq,
        verdict,
      });
      ctx.ui.notify(`Result ${seq} marked ${verdict}`, "info");
    },
  });

  pi.registerCommand("room-clear", {
    description: "Clear pending A2A deliveries and stop reply propagation",
    handler: async (_args, ctx) => {
      if (!runtime) return ctx.ui.notify("A2A room is not ready", "warning");
      ctx.ui.notify(await post(`${runtime.baseURL}queue/clear`), "info");
    },
  });

  pi.registerCommand("room-stop", {
    description: "Stop this Pi session's A2A sidecar",
    handler: async (_args, ctx) => {
      if (!runtime) return ctx.ui.notify("No A2A sidecar is running", "info");
      await stopRuntime(runtime);
      runtime = undefined;
      ctx.ui.notify("A2A sidecar stopped", "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.isProjectTrusted()) {
      ctx.ui.setStatus(
        STATUS_KEY,
        ctx.ui.theme.fg("warning", "a2a · project not trusted"),
      );
      ctx.ui.notify(
        "Trust this project to allow the A2A room sidecar to start.",
        "warning",
      );
      return;
    }
    ctx.ui.setTitle(`Pi · A2A room · ${ctx.cwd.split("/").at(-1)}`);
    if (!autocompleteRegistered) {
      ctx.ui.addAutocompleteProvider((current) =>
        createMentionProvider(current, () => runtime?.members ?? []),
      );
      autocompleteRegistered = true;
    }
    try {
      const rt = await startRuntime(pi, ctx);
      ctx.ui.notify(
        `A2A room ready with ${rt.members.map((name) => `@${name}`).join(", ")}`,
        "info",
      );
    } catch (error) {
      ctx.ui.setStatus(
        STATUS_KEY,
        ctx.ui.theme.fg("error", "a2a failed to start"),
      );
      ctx.ui.notify(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  });

  pi.on("input", async (event) => {
    if (event.source !== "interactive") return { action: "continue" };
    const text = event.text.trim();
    if (/^@pi(?:\s|$)/i.test(text))
      return {
        action: "transform",
        text: text.replace(/^@pi\s*/i, ""),
        images: event.images,
      };
    if (!runtime?.ready || !mentionedPeer(text, runtime.members))
      return { action: "continue" };
    localMessage(pi, "pi → room", text, "outbound");
    try {
      await dispatch(pi, text);
    } catch (error) {
      localMessage(
        pi,
        "room",
        error instanceof Error ? error.message : String(error),
        "system",
      );
    }
    return { action: "handled" };
  });

  pi.on("session_shutdown", async () => {
    if (runtime) await stopRuntime(runtime);
    runtime = undefined;
  });
}
