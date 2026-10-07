# Video notes: save captions already available on the page

On a YouTube or Bilibili watch page, the user chooses **Save video note to EdgeEver**. The extension reads the current video's metadata and any captions already provided by the platform. It saves the title, creator, source link, available cover, and captions with links back to the original timestamps. When captions exist and the workspace has an available chat model, it may also generate a summary, outline, and takeaways; failure does not block saving the note.

Supported pages are ordinary YouTube videos and Shorts, and ordinary Bilibili videos including multipart videos. Live streams, series, courses, and other pages do not create video notes. Without captions, the note contains source information and a **No captions available for this video** message. It does not start speech transcription. Video notes have no command to extract captions again and do not download videos or audio tracks from external platforms.

## Speech transcription for note attachments

Users can explicitly transcribe an audio or MP4/WebM video attachment already uploaded to a note. A workspace configures an OpenAI-compatible speech provider and default model. The API accepts only a note ID and an attachment ID belonging to that note; it does not accept a media URL. Attachments are limited to 24 MiB, and provider credentials remain encrypted on the instance. The EdgeEver instance reads the attachment and sends it to the configured `/audio/transcriptions` service. The result is shown for copying or insertion into the current note. Plugins can use the same capability through `context.ai.transcribeResource(noteId, resourceId)`.

## Withdrawn external media retrieval design: technical notes

The following records an unreleased external media retrieval design for possible future evaluation of authorized use. **It does not describe current product behavior or a planned feature.** The withdrawn scope includes external audio retrieval, browser session reuse, automatic yt-dlp installation and updates, external video transcription jobs, and desktop polling. Note attachment transcription above is a separate implementation.

### Jobs and data boundaries

- The proposed design encoded the platform, video ID, source URL, duration, and missing-caption placeholder in a hidden marker in the note body. Saving a note did not create a job; a user action in the note list created one.
- The API scoped jobs by workspace and note ID and recorded a content hash. Clipper tokens and demo instances could not create or claim jobs. A conditional update let one desktop client claim a job; a job stalled for roughly 20 minutes could be reclaimed.
- Writing the result back to the same note required the expected revision and content hash. A user edit prevented an overwrite. The placeholder would be replaced when present; otherwise the transcript would be appended. Failure left the original note intact and did not trigger repeated automatic retries.

### Local media processing and model calls

- The proposed design checked an HTTPS source against a platform allowlist, then used yt-dlp locally to select only the best audio track, without saving video. It limited known duration to roughly 30 minutes, audio to roughly 24 MiB, and both download and transcription time. Temporary audio was deleted after the job. Resource limits do not grant copyright permission.
- The standalone yt-dlp executable came from its releases and was checked against SHA-256; the desktop client checked for updates in the background. Optional `--cookies-from-browser` reused a local browser session, with the browser choice stored only on that device. This widened the range of accessible media; local execution did not establish permission from a platform or rights holder.
- The old design let an authenticated desktop client obtain speech credentials and send audio directly to the chosen OpenAI-compatible `/audio/transcriptions` endpoint. Current attachment transcription sends media from the EdgeEver instance, so the old claim that audio bypasses the note server no longer applies.
- Segments with timestamps became transcript links back to the source; a plain-text-only response became a text block. Failures recorded error codes without writing API tokens to diagnostics.

Any future revival should first establish content rights, platform terms, target markets, and the transcription provider's data handling, then redesign the entry point and verification scope. The retrieval path above should not simply be re-enabled.
