/**
 * Read an SSE body produced by `sseResponse`.
 *
 * `EventSource` is not an option: these streams are POSTs that carry a session
 * cookie and a JSON body, and EventSource can only GET.
 *
 * Deliberately tolerant of framing — comments, blank lines, and the `[DONE]`
 * sentinel are skipped, and a frame that fails to parse is dropped rather than
 * killing the stream. A malformed keepalive is not worth losing an answer over.
 *
 * What it does NOT swallow is a throw from `onEvent`: the consumer uses that to
 * abort a turn, and catching it here would leave the caller waiting forever on
 * a stream it has already given up on.
 */
export async function readEventStream<E>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: E) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // The last element is whatever arrived after the final newline — it may
      // be half a frame, so it waits for the next chunk.
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(":") || line.startsWith("event:")) continue;
        const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
        if (!payload || payload === "[DONE]") continue;
        let parsed: E;
        try {
          parsed = JSON.parse(payload) as E;
        } catch {
          continue;
        }
        onEvent(parsed);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
