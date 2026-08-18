import { summarizeState, type JspaceState } from "./state.ts";

export const JSPACE_POLICY = `J-Space session mode is on. Use it as a harness discipline for multi-step work:
1. Keep one immediate objective and at most two live core constraints.
2. Record durable state with jspace_checkpoint after evidence changes the plan, after a failed attempt, and before delivery. A verified claim must name its verifier and coverage.
3. Diagnose a failure before retrying, then change the approach or the evidence sought.
4. Before delivery, reread the request and compare every completion claim with the recorded verifier coverage.
Keep the ledger concise and task-facing. It stores state, not private reasoning, narration, or a task list.`;

export function buildJspaceSystemPrompt(
  baseSystemPrompt: string,
  state: JspaceState,
): string {
  const ledger = summarizeState(state);
  const start = state.goal
    ? ledger
    : `${ledger}\nFor a multi-step task, open the ledger before the first consequential action.`;
  return `${baseSystemPrompt}\n\n${JSPACE_POLICY}\n\nCurrent J-Space ledger:\n${start}`;
}
