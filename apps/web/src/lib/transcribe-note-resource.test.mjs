import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { extractAudioParts, transcribePreparedAudioParts } from "./transcribe-note-resource.ts";

const fixturePath = fileURLToPath(new URL("./fixtures/transcription-video.mp4", import.meta.url));

describe("client-side note media preparation", () => {
  test("extracts audio from video and produces independently readable segments", async () => {
    const video = new Uint8Array(await readFile(fixturePath));
    const ranges = [];
    const parts = [];
    for await (const part of extractAudioParts(
      video.byteLength,
      async (start, end) => {
        ranges.push([start, end]);
        return video.slice(start, end);
      },
      undefined,
      { maxChunkSeconds: 0.7 },
    )) parts.push(part);

    expect(ranges.length).toBeGreaterThan(0);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.type).toStartWith("audio/");
      expect(part.size).toBeLessThan(video.byteLength);
      const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(await part.arrayBuffer()) });
      expect(await input.canRead()).toBe(true);
      expect(await input.getPrimaryAudioTrack()).not.toBeNull();
      expect(await input.getPrimaryVideoTrack()).toBeNull();
      input.dispose();
    }
  });

  test.each([
    ["transcription-audio.mp3", "audio/mpeg"],
    ["transcription-video.webm", "audio/webm"],
  ])("handles %s without sending video frames", async (name, expectedMime) => {
    const bytes = new Uint8Array(await readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
    const parts = [];
    for await (const part of extractAudioParts(bytes.byteLength, async (start, end) => bytes.slice(start, end))) {
      parts.push(part);
    }
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe(expectedMime);
    const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(await parts[0].arrayBuffer()) });
    expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    expect(await input.getPrimaryVideoTrack()).toBeNull();
    input.dispose();
  });

  test("sends each prepared segment directly to the configured speech endpoint", async () => {
    const requests = [];
    const completed = [];
    async function* parts() {
      yield new File(["first"], "first.mp3", { type: "audio/mpeg" });
      yield new File(["second"], "second.mp3", { type: "audio/mpeg" });
    }
    const text = await transcribePreparedAudioParts(
      { baseUrl: "https://speech.example/v1", modelId: "whisper-1", apiKey: "secret" },
      parts(),
      async (url, init) => {
        requests.push({ url, init });
        return Response.json({ text: `segment ${requests.length}` });
      },
      undefined,
      (count) => completed.push(count),
    );
    expect(text).toBe("segment 1\n\nsegment 2");
    expect(completed).toEqual([1, 2]);
    expect(requests.map(({ url }) => url)).toEqual([
      "https://speech.example/v1/audio/transcriptions",
      "https://speech.example/v1/audio/transcriptions",
    ]);
    for (const { init } of requests) {
      expect(init.headers.Authorization).toBe("Bearer secret");
      expect(init.body.get("model")).toBe("whisper-1");
      expect(init.body.get("file")).toBeInstanceOf(File);
    }
  });
});
