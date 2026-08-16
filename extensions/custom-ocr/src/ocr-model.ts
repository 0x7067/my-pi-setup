/**
 * Selectable OCR transcription model for the private (local MLX) pipeline.
 *
 * The OCR worker's model is a machine-level preference persisted as a single
 * line in `<agent>/config/custom-ocr-model` — same convention as the calm
 * extension and custom-ocr's own mode file. GLM-OCR is the default (won the
 * head-to-head against DeepSeek-OCR-2 on degraded scans); DeepSeek-OCR-2 is
 * kept as a fallback toggle.
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

/** Which local OCR model the transcription worker loads. */
export type OcrModelKind = "glm" | "deepseek";

export const GLM_OCR_MODEL_ID = "mlx-community/GLM-OCR-4bit";
export const DEEPSEEK_OCR_MODEL_ID = "mlx-community/DeepSeek-OCR-2-4bit";

export const OCR_MODEL_IDS: Record<OcrModelKind, string> = {
  glm: GLM_OCR_MODEL_ID,
  deepseek: DEEPSEEK_OCR_MODEL_ID,
};

export const DEFAULT_OCR_MODEL: OcrModelKind = "glm";

export function isOcrModelKind(value: unknown): value is OcrModelKind {
  return value === "glm" || value === "deepseek";
}

/** Path of the file holding the OCR model new sessions use. */
export function ocrModelPreferencePath(root: string) {
  const configDirectory =
    process.env.CUSTOM_OCR_CONFIG_OVERRIDE || resolve(root, "config");
  return resolve(configDirectory, "custom-ocr-model");
}

/** The OCR model a session uses. Unreadable or unrecognized content means GLM. */
export function readDefaultOcrModel(path: string): OcrModelKind {
  try {
    const value = readFileSync(path, "utf8").trim();
    return isOcrModelKind(value) ? value : DEFAULT_OCR_MODEL;
  } catch {
    return DEFAULT_OCR_MODEL;
  }
}

/**
 * Record the OCR model new sessions use. Written through a temp file so a
 * crash mid-write cannot leave a truncated preference behind. Failure is
 * silent on purpose: losing the preference must never break a parse.
 */
export function persistDefaultOcrModel(path: string, kind: OcrModelKind): void {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporaryPath, `${kind}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } catch {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Nothing to clean up.
    }
  }
}

export type OcrModelAction =
  | { readonly action: "set"; readonly kind: OcrModelKind }
  | { readonly action: "status" }
  | { readonly action: "error"; readonly message: string };

/**
 * Parse `/ocr-model` arguments. `glm` / `deepseek` set the model explicitly,
 * `status` reports the current choice, and anything else is an error (no bare
 * toggle — switching models unloads workers, so an explicit choice is safer).
 */
export function parseOcrModelArgs(
  args: string | undefined,
  current: OcrModelKind,
): OcrModelAction {
  const trimmed = (args ?? "").trim().toLowerCase();
  if (trimmed === "status") return { action: "status" };
  if (trimmed === "glm") return { action: "set", kind: "glm" };
  if (trimmed === "deepseek") return { action: "set", kind: "deepseek" };
  if (trimmed === "") {
    return {
      action: "error",
      message: "Usage: /ocr-model [glm|deepseek|status]",
    };
  }
  return {
    action: "error",
    message: `Unknown OCR model "${trimmed}". Use /ocr-model [glm|deepseek|status].`,
  };
}
