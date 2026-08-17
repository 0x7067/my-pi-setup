/** Serializes explicit refreshes while allowing background refreshes to coalesce. */
export function makeRefreshCoordinator() {
  let active: Promise<void> | undefined;
  let pendingBackground:
    | {
        task: () => Promise<unknown>;
      }
    | undefined;

  const run = <A>(task: () => Promise<A>): Promise<A> => {
    const previous = active;
    const result = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    const marker = result.then(
      () => undefined,
      () => undefined,
    );
    active = marker;
    void marker.then(() => {
      if (active !== marker) return;
      const next = pendingBackground;
      pendingBackground = undefined;
      if (next) {
        void run(next.task);
      } else {
        active = undefined;
      }
    });
    // A coalesced background task has no caller when it is replaced by a newer
    // one, so consume its rejection here. Explicit callers still receive the
    // original promise and can observe failures normally.
    void result.catch(() => undefined);
    return result;
  };

  return {
    run,
    runIfIdle: <A>(task: () => Promise<A>): Promise<A> | undefined => {
      if (active) {
        // Keep only the newest background request. It will start when the
        // active refresh settles, even if the active refresh rejects.
        pendingBackground = { task: task as () => Promise<unknown> };
        return undefined;
      }
      return run(task);
    },
  };
}
