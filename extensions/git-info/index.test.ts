import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import gitInfo from "./index.ts";
import { GIT_INFO_CHANNEL } from "../shared/dashboard-state.ts";

type Handler = (event: unknown, context: unknown) => unknown;

test("does not publish a detached HEAD from an obsolete session", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-git-info-"));
  const oldCwd = path.join(root, "old");
  const newCwd = path.join(root, "new");
  const bin = path.join(root, "bin");
  await Promise.all([mkdir(oldCwd), mkdir(newCwd), mkdir(bin)]);
  await writeFile(
    path.join(bin, "git"),
    [
      "#!/bin/sh",
      'if [ "$1" = "status" ]; then',
      '  case "$PWD" in */old) printf "## HEAD (no branch)\\n" ;; *) printf "## main\\n" ;; esac',
      'elif [ "$1" = "rev-parse" ]; then',
      '  case "$PWD" in */old) sleep 1; printf "oldhead\\n" ;; *) printf "newhead\\n" ;; esac',
      "fi",
    ].join("\n"),
  );
  await chmod(path.join(bin, "git"), 0o755);

  const handlers = new Map<string, Handler[]>();
  const states: Array<{ branch: string | null }> = [];
  const pi = {
    on(event: string, handler: Handler) {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
    events: {
      emit(channel: string, state: { branch: string | null }) {
        if (channel === GIT_INFO_CHANNEL) states.push(state);
      },
      on() {
        return () => {};
      },
    },
    registerCommand() {},
  };

  const emit = async (event: string, cwd: string) => {
    const context = { cwd, signal: undefined };
    for (const handler of handlers.get(event) ?? []) {
      await handler({}, context);
    }
  };
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ""}`;

  try {
    gitInfo(pi as never);
    await emit("session_start", oldCwd);
    await emit("session_start", newCwd);

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 3_000;
      const check = () => {
        if (states.some((state) => state.branch === "main")) {
          resolve();
        } else if (Date.now() >= deadline) {
          reject(new Error("new session did not publish git state"));
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });

    assert.equal(
      states.some((state) => state.branch === "detached@oldhead"),
      false,
    );
  } finally {
    await emit("session_shutdown", newCwd);
    process.env.PATH = previousPath;
    await rm(root, { recursive: true, force: true });
  }
});
