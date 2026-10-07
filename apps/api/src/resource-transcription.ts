import { AppError } from "./app-error";
import { prepareAiTranscriptionCredentials } from "./ai-service";
import { resolveObjectStorage } from "./object-storage";
import { getResourceRow } from "./resource-service";
import type { Bindings } from "./api-context";

export const MAX_TRANSCRIPTION_BYTES = 24 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set(["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"]);

export const isTranscribableAttachment = (resource: {
  kind: string;
  mime_type: string | null;
  filename: string | null;
}) => {
  if (resource.kind !== "attachment") return false;
  const extension = /\.([a-z0-9]+)$/i.exec(resource.filename ?? "")?.[1]?.toLowerCase();
  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) return false;
  const mime = (resource.mime_type ?? "").toLowerCase();
  return mime.startsWith("audio/") || mime === "video/mp4" || mime === "video/webm";
};

export const transcribeNoteResource = async (
  env: Bindings,
  workspaceId: string,
  memoId: string,
  resourceId: string,
  fetchImpl: typeof fetch = fetch,
  abortSignal?: AbortSignal,
) => {
  const resource = await getResourceRow(env.storage.db, workspaceId, resourceId);
  if (!resource || resource.memo_id !== memoId) {
    throw new AppError("resource_not_found", "This attachment does not belong to the note.", 404);
  }
  if (!isTranscribableAttachment(resource)) {
    throw new AppError("unsupported_media_type", "Choose an audio or MP4/WebM video attachment.", 415);
  }
  if (resource.byte_size < 1 || resource.byte_size > MAX_TRANSCRIPTION_BYTES) {
    throw new AppError("audio_too_large", "The attachment must be 24 MiB or smaller.", 413);
  }
  const credentials = await prepareAiTranscriptionCredentials(env.storage.db, workspaceId, env);
  if (!credentials.enabled) {
    throw new AppError("ai_transcription_not_configured", "Choose a default speech model first.", 409);
  }

  const source = await resolveObjectStorage(env, resource.storage_config_id);
  const object = await source.store.get(resource.object_key);
  if (!object) throw new AppError("resource_not_found", "Attachment bytes are unavailable.", 404);
  const bytes = await new Response(object.body).arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_TRANSCRIPTION_BYTES) {
    throw new AppError("audio_too_large", "The attachment must be 24 MiB or smaller.", 413);
  }

  const body = new FormData();
  body.set("model", credentials.modelId);
  body.set("file", new File([bytes], resource.filename || "recording.mp3", {
    type: resource.mime_type || "application/octet-stream",
  }));
  let response: Response;
  try {
    response = await fetchImpl(`${credentials.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
      body,
      signal: abortSignal
        ? AbortSignal.any([abortSignal, AbortSignal.timeout(180_000)])
        : AbortSignal.timeout(180_000),
    });
  } catch {
    throw new AppError("ai_transcription_failed", "The speech service could not be reached.", 502);
  }
  if (!response.ok) {
    throw new AppError("ai_transcription_failed", `The speech service returned HTTP ${response.status}.`, 502);
  }
  const result = await response.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof result?.text === "string" ? result.text.trim() : "";
  if (!text) throw new AppError("empty_transcript", "The speech service returned no transcript.", 502);
  return { text, resourceId, filename: resource.filename ?? "" };
};
