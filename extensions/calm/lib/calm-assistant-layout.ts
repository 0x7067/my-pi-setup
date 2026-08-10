// Collapsed-thinking adapter: hide "thinking" content blocks from assistant
// messages when calm is active.
//
// Probes AssistantMessageComponent.updateContent and throws if missing; the
// caller catches that and skips only this adapter instead of blocking Calm.

import {
	AssistantMessageComponent,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { calmPresentationHides } from "./calm-visibility.js";

type AssistantMessage = Parameters<
	AssistantMessageComponent["updateContent"]
>[0];

type AssistantMessagePresentationState = {
	hiddenThinkingLabel: string;
	hideThinkingBlock: boolean;
	lastMessage?: AssistantMessage;
};

type CalmAssistantLayoutPatch = {
	hidesThinking: () => boolean;
};

// Stable symbol so a compatible upgrade cannot double-patch a live process.
const CALM_ASSISTANT_LAYOUT_PATCH = Symbol.for("calm:assistant-layout:v1");

export function installCalmAssistantLayout(_pi: ExtensionAPI): void {
	const registry = globalThis as typeof globalThis & {
		[key: symbol]: CalmAssistantLayoutPatch | undefined;
	};

	const hidesThinking = (): boolean =>
		calmPresentationHides("assistant-thinking");

	const installed = registry[CALM_ASSISTANT_LAYOUT_PATCH];
	if (installed) {
		installed.hidesThinking = hidesThinking;
		return;
	}

	const patch: CalmAssistantLayoutPatch = { hidesThinking };

	if (typeof AssistantMessageComponent !== "function") {
		throw new Error("Calm requires Pi AssistantMessageComponent");
	}
	const originalUpdateContent =
		AssistantMessageComponent.prototype.updateContent;
	if (typeof originalUpdateContent !== "function") {
		throw new Error("Calm requires Pi AssistantMessageComponent.updateContent");
	}

	AssistantMessageComponent.prototype.updateContent = function (
		message: AssistantMessage,
	): void {
		const state = this as unknown as AssistantMessagePresentationState;
		const hideThinking =
			state.hiddenThinkingLabel === "" &&
			state.hideThinkingBlock &&
			patch.hidesThinking();

		const presentationMessage = hideThinking
			? {
					...message,
					content: message.content.filter((block) => block.type !== "thinking"),
				}
			: message;

		originalUpdateContent.call(this, presentationMessage);
		if (presentationMessage !== message) state.lastMessage = message;
	};

	registry[CALM_ASSISTANT_LAYOUT_PATCH] = patch;
}
