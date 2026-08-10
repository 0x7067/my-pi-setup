// Calm visibility state — which transcript classes are hidden in calm mode.

export const CALM_TRANSCRIPT_CLASSES = [
	"genuine-user-prompt",
	"genuine-agent-response",
	"assistant-thinking",
	"assistant-tool-call",
	"tool-result",
	"tool-image",
	"user-bash",
	"skill-invocation",
	"custom-message",
	"custom-entry",
	"compaction-summary",
	"branch-summary",
	"working-status",
	"command-status",
	"system-notice",
	"cache-notice",
	"project-trust-warning",
	"synthetic-user",
	"synthetic-assistant",
	"unknown",
] as const;

export type CalmTranscriptClass = (typeof CALM_TRANSCRIPT_CLASSES)[number];

const CALM_VISIBLE_CLASSES = new Set<CalmTranscriptClass>([
	"genuine-user-prompt",
	"genuine-agent-response",
	"working-status",
]);

export const CALM_PRESENTATION_EVENT = "calm:presentation";

export type CalmPresentationState = {
	active: boolean;
	stockExportRendering: boolean;
};

let calm = false;
let stockExportRendering = false;

export function calmTranscriptClassIsVisible(
	itemClass: CalmTranscriptClass,
): boolean {
	return CALM_VISIBLE_CLASSES.has(itemClass);
}

export function setCalmPresentation(active: boolean): void {
	calm = active;
}

export function setCalmStockExportRendering(active: boolean): void {
	stockExportRendering = active;
}

export function calmPresentationIsActive(): boolean {
	return calm;
}

// In calm mode, hide every non-visible class — unless we are rendering a stock
// export/share, in which case everything must show through unmodified.
export function calmPresentationHides(itemClass: CalmTranscriptClass): boolean {
	return (
		calm && !stockExportRendering && !calmTranscriptClassIsVisible(itemClass)
	);
}
