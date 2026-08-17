import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  emptyGitInfoState,
  GIT_INFO_CHANNEL,
  REFRESH_CHANNEL,
  type PullRequestInfo,
} from "../shared/dashboard-state.ts";
import { makeRefreshCoordinator } from "./src/refresh-coordinator.ts";
import { parseGitStatus } from "./src/status.ts";

const POLL_INTERVAL_MS = 10_000;
const GIT_TIMEOUT_MS = 3_000;
const GH_TIMEOUT_MS = 10_000;

function parsePullRequest(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  if (!("number" in value) || typeof value.number !== "number") return null;
  if (!("url" in value) || typeof value.url !== "string") return null;
  if (!("state" in value) || value.state !== "OPEN") return null;

  return {
    number: value.number,
    url: value.url,
    isDraft: "isDraft" in value && value.isDraft === true,
  } satisfies PullRequestInfo;
}

function parsePullRequestJson(value: string) {
  try {
    return parsePullRequest(JSON.parse(value));
  } catch {
    return null;
  }
}

export default function gitInfo(pi: ExtensionAPI) {
  let state = emptyGitInfoState();
  let pollingTimer: ReturnType<typeof setInterval> | undefined;
  let backgroundController: AbortController | undefined;
  let currentContext: ExtensionContext | undefined;
  let generation = 0;
  let queriedPrBranch: string | null = null;
  const refreshCoordinator = makeRefreshCoordinator();

  const updateState = (next: typeof state) => {
    if (
      state.isRepository === next.isRepository &&
      state.branch === next.branch &&
      state.changedFiles === next.changedFiles &&
      state.pullRequest?.number === next.pullRequest?.number &&
      state.pullRequest?.url === next.pullRequest?.url &&
      state.pullRequest?.isDraft === next.pullRequest?.isDraft
    ) {
      return;
    }
    state = next;
    pi.events.emit(GIT_INFO_CHANNEL, { ...state });
  };
  const run = async (
    command: string,
    args: string[],
    ctx: ExtensionContext,
    timeout: number,
    signal?: AbortSignal,
  ) => {
    const result = await pi.exec(command, args, {
      cwd: ctx.cwd,
      timeout,
      signal,
    });
    return { ...result, code: result.killed ? -1 : result.code };
  };

  const lookupPullRequest = async (
    ctx: ExtensionContext,
    branch: string,
    signal?: AbortSignal,
  ) => {
    const result = await run(
      "gh",
      ["pr", "view", branch, "--json", "number,url,state,isDraft"],
      ctx,
      GH_TIMEOUT_MS,
      signal,
    );
    if (result.code !== 0) return null;
    return parsePullRequestJson(result.stdout);
  };

  const refresh = async (
    ctx: ExtensionContext,
    forcePullRequest: boolean,
    refreshGeneration: number,
    signal?: AbortSignal,
  ) => {
    if (refreshGeneration !== generation) return;
    currentContext = ctx;

    const statusResult = await run(
      "git",
      ["status", "--porcelain=v1", "--branch", "--untracked-files=all"],
      ctx,
      GIT_TIMEOUT_MS,
      signal,
    );
    if (refreshGeneration !== generation) return;

    const status =
      statusResult.code === 0 ? parseGitStatus(statusResult.stdout) : null;
    if (!status) {
      queriedPrBranch = null;
      updateState(emptyGitInfoState());
      return;
    }

    const branchName = status.branchName;
    const headResult = branchName
      ? null
      : await run(
          "git",
          ["rev-parse", "--short", "HEAD"],
          ctx,
          GIT_TIMEOUT_MS,
          signal,
        );
    const shortHead = headResult?.stdout.trim() ?? "";
    const branch =
      branchName || (shortHead ? `detached@${shortHead}` : "detached");
    const branchChanged = branchName !== queriedPrBranch;

    updateState({
      ...state,
      isRepository: true,
      branch,
      changedFiles: status.changedFiles,
      pullRequest: branchChanged ? null : state.pullRequest,
    });

    if (!branchName) {
      // queriedPrBranch is never "", so branchChanged already cleared pullRequest.
      queriedPrBranch = null;
      return;
    }

    if (forcePullRequest || branchChanged) {
      queriedPrBranch = branchName;
      const pullRequest = await lookupPullRequest(ctx, branchName, signal);
      if (refreshGeneration !== generation) return;
      updateState({ ...state, pullRequest });
    }
  };

  const refreshInBackground = (ctx: ExtensionContext) => {
    const refreshGeneration = generation;
    const signal = backgroundController?.signal;
    const pending = refreshCoordinator.runIfIdle(() =>
      refresh(ctx, false, refreshGeneration, signal),
    );
    void pending?.catch((error) => {
      console.error("git-info background refresh failed", error);
    });
  };

  const stopRefreshListener = pi.events.on(REFRESH_CHANNEL, () => {
    if (currentContext) refreshInBackground(currentContext);
  });

  pi.on("session_start", (_event, ctx) => {
    generation += 1;
    queriedPrBranch = null;
    backgroundController?.abort();
    backgroundController = new AbortController();
    if (pollingTimer) clearInterval(pollingTimer);

    // Do not block Pi startup on GitHub/network I/O. The initial refresh publishes
    // state when it completes; polling continues to keep it current afterwards.
    refreshInBackground(ctx);
    pollingTimer = setInterval(() => {
      if (currentContext) refreshInBackground(currentContext);
    }, POLL_INTERVAL_MS);
    pollingTimer.unref?.();
  });

  pi.on("input", (_event, ctx) => {
    refreshInBackground(ctx);
    return { action: "continue" };
  });

  pi.on("tool_execution_end", (_event, ctx) => {
    refreshInBackground(ctx);
  });

  pi.on("session_shutdown", () => {
    stopRefreshListener();
    generation += 1;
    backgroundController?.abort();
    backgroundController = undefined;
    currentContext = undefined;
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = undefined;
  });

  pi.registerCommand("lg", {
    description: "Browse changed files and their diffs",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          "The local changes viewer requires the interactive TUI",
          "warning",
        );
        return;
      }

      const [
        { loadChangedFiles, showChangedFiles },
        { createRuntime, runEffect },
      ] = await Promise.all([
        import("./src/changed-files-view.ts"),
        import("./src/runtime.ts"),
      ]);
      const runtime = createRuntime();
      const files = await runEffect(runtime, loadChangedFiles(ctx.cwd), {
        signal: ctx.signal,
        interruptMessage: "Loading changed files was cancelled.",
      }).finally(() => runtime.dispose());
      if (files === null) {
        ctx.ui.notify("Not a git repository", "warning");
        return;
      }
      if (files.length === 0) {
        ctx.ui.notify("Working tree is clean", "info");
        return;
      }

      await showChangedFiles(ctx, files);
    },
  });

  pi.registerCommand("pr", {
    description: "Refresh git and pull request information",
    handler: async (_args, ctx) => {
      await refreshCoordinator.run(() =>
        refresh(ctx, true, generation, ctx.signal),
      );
      if (ctx.signal?.aborted) {
        throw new Error("Git and pull request refresh was cancelled.");
      }
      if (!state.isRepository) {
        ctx.ui.notify("Not a git repository", "warning");
      } else if (state.pullRequest) {
        ctx.ui.notify(
          `PR #${state.pullRequest.number}: ${state.pullRequest.url}`,
          "info",
        );
      } else {
        ctx.ui.notify(`No open PR found for ${state.branch}`, "info");
      }
    },
  });
}
