import { describe, expect, test } from "bun:test";
import { resolvePrimaryAiCredentialEncryptionKey } from "./ai-service.ts";
import { encryptSecret } from "./secret-encryption.ts";
import { isTranscribableAttachment, transcribeNoteResource } from "./resource-transcription.ts";

const makeEnvironment = async (resource) => {
  const env = {
    EDGE_EVER_AUTH_PASSWORD: "test-password-long-enough",
    storage: {
      resources: {
        get: async () => ({ body: new Blob(["audio bytes"]).stream() }),
      },
      db: {
        prepare: (sql) => ({
          bind: (...args) => ({
            first: async () => {
              if (sql.includes("FROM resources r")) return args[0] === resource.id && args[1] === "ws_one" ? resource : null;
              if (sql.includes("FROM ai_transcription_workspace_settings AS settings")) return {
                model_id: "whisper-1",
                provider: "openai-compatible",
                base_url: "https://speech.example/v1",
                api_key_encrypted: await encryptSecret("secret-token", resolvePrimaryAiCredentialEncryptionKey(env)),
              };
              if (sql.includes("FROM object_storage_configs")) return { id: "builtin", provider: "builtin" };
              return null;
            },
          }),
        }),
      },
    },
  };
  return env;
};

const resource = {
  id: "res_one",
  memo_id: "memo_one",
  kind: "attachment",
  filename: "meeting.mp4",
  mime_type: "video/mp4",
  byte_size: 11,
  storage_config_id: "builtin",
  object_key: "workspace/meeting.mp4",
};

describe("note attachment transcription boundary", () => {
  test("accepts only supported audio and video attachments", () => {
    expect(isTranscribableAttachment(resource)).toBe(true);
    expect(isTranscribableAttachment({ ...resource, filename: "meeting.exe" })).toBe(false);
    expect(isTranscribableAttachment({ ...resource, mime_type: "application/octet-stream" })).toBe(false);
    expect(isTranscribableAttachment({ ...resource, kind: "image" })).toBe(false);
  });

  test("rejects an attachment from another note before reading it", async () => {
    const env = await makeEnvironment(resource);
    await expect(transcribeNoteResource(env, "ws_one", "memo_other", "res_one", () => {
      throw new Error("Provider must not be called");
    })).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
  });

  test("sends only the note attachment to the configured model and returns text", async () => {
    const env = await makeEnvironment(resource);
    const calls = [];
    const result = await transcribeNoteResource(env, "ws_one", "memo_one", "res_one", async (url, init) => {
      calls.push({ url, init });
      return Response.json({ text: " Meeting notes. " });
    });
    expect(result).toEqual({ text: "Meeting notes.", resourceId: "res_one", filename: "meeting.mp4" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://speech.example/v1/audio/transcriptions");
    expect(calls[0].init.headers.Authorization).toBe("Bearer secret-token");
    expect(calls[0].init.body.get("model")).toBe("whisper-1");
    expect((await calls[0].init.body.get("file").text())).toBe("audio bytes");
  });
});
