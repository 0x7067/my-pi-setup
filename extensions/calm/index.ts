import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	AssistantMessageComponent,
	BashExecutionComponent,
	CustomMessageComponent,
	InteractiveMode,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

type RenderPatch = {
	active: () => boolean;
	original: Component["render"];
};

type InteractiveModePrototype = {
	addCustomEntryToChat(this: unknown, entry: unknown): void;
};

type AssistantMessage = Parameters<
	AssistantMessageComponent["updateContent"]
>[0];

type AssistantMessageState = {
	lastMessage?: AssistantMessage;
};

type AssistantPatch = {
	active: () => boolean;
	original: AssistantMessageComponent["updateContent"];
};

type CustomEntryPatch = {
	active: () => boolean;
	original: InteractiveModePrototype["addCustomEntryToChat"];
};

type GlobalPatchRegistry = typeof globalThis & {
	[key: symbol]: RenderPatch | AssistantPatch | CustomEntryPatch | undefined;
};

function patchRender(
	key: symbol,
	component: { render: Component["render"] },
	active: () => boolean,
) {
	const registry = globalThis as GlobalPatchRegistry;
	const existing = registry[key];
	if (existing) {
		existing.active = active;
		return;
	}

	const original = component.render;
	const patch: RenderPatch = { active, original };
	component.render = function (width) {
		return patch.active() ? [] : patch.original.call(this, width);
	};
	registry[key] = patch;
}

function patchAssistantMessages(active: () => boolean) {
	const registry = globalThis as GlobalPatchRegistry;
	const key = Symbol.for("pi:conversation-only:assistant-messages");
	const existing = registry[key];
	if (existing) {
		existing.active = active;
		return;
	}

	const original = AssistantMessageComponent.prototype.updateContent;
	const patch: AssistantPatch = { active, original };
	AssistantMessageComponent.prototype.updateContent = function (message) {
		const presentationMessage = patch.active()
			? {
					...message,
					content: message.content.filter((block) => block.type !== "thinking"),
				}
			: message;

		patch.original.call(this, presentationMessage);
		if (presentationMessage !== message) {
			(this as unknown as AssistantMessageState).lastMessage = message;
		}
	};
	registry[key] = patch;
}

function patchCustomEntries(active: () => boolean) {
	const registry = globalThis as GlobalPatchRegistry;
	const key = Symbol.for("pi:conversation-only:custom-entries");
	const existing = registry[key];
	if (existing) {
		existing.active = active;
		return;
	}

	const prototype =
		InteractiveMode.prototype as unknown as InteractiveModePrototype;
	const original = prototype.addCustomEntryToChat;
	const patch: CustomEntryPatch = { active, original };
	prototype.addCustomEntryToChat = function (entry) {
		if (!patch.active()) patch.original.call(this, entry);
	};
	registry[key] = patch;
}

export default function calm(pi: ExtensionAPI) {
	let active = true;
	const isActive = () => active;

	patchAssistantMessages(isActive);
	patchRender(
		Symbol.for("pi:conversation-only:tool-execution"),
		ToolExecutionComponent.prototype,
		isActive,
	);
	patchRender(
		Symbol.for("pi:conversation-only:bash-execution"),
		BashExecutionComponent.prototype,
		isActive,
	);
	patchRender(
		Symbol.for("pi:conversation-only:custom-message"),
		CustomMessageComponent.prototype,
		isActive,
	);
	patchCustomEntries(isActive);

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setWorkingVisible(!active);
		ctx.ui.setHiddenThinkingLabel(active ? "" : undefined);
	});

	pi.on("agent_start", (_event, ctx) => {
		if (ctx.mode === "tui" && active) ctx.ui.setWorkingVisible(false);
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (ctx.mode === "tui" && active) ctx.ui.setWorkingVisible(false);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.setWorkingVisible(true);
	});

	pi.registerCommand("calm", {
		description: "Toggle calm conversation-only presentation",
		handler: async (_args, ctx) => {
			active = !active;
			if (ctx.mode !== "tui") return;

			ctx.ui.setWorkingVisible(!active);
			ctx.ui.setHiddenThinkingLabel(active ? "" : undefined);
			const expanded = ctx.ui.getToolsExpanded();
			ctx.ui.setToolsExpanded(!expanded);
			ctx.ui.setToolsExpanded(expanded);
			ctx.ui.notify(
				active ? "Calm view enabled" : "Calm view disabled",
				"info",
			);
		},
	});
}
