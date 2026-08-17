/** Serializes explicit refreshes while allowing background refreshes to coalesce. */
export function makeRefreshCoordinator() {
  let active: Promise<void> | undefined;

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
      if (active === marker) active = undefined;
    });
    return result;
  };

  return {
    run,
    runIfIdle: <A>(task: () => Promise<A>) => {
      if (active) return undefined;
      return run(task);
    },
  };
}
