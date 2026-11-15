/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The run checker runs here, in a background thread, so the game never freezes while
// it searches. All the logic is in checkerProtocol.ts; this file only wires messages.

import { handle, type CheckerRequest } from "./checkerProtocol";

const worker = self as unknown as {
  onmessage: ((e: MessageEvent<CheckerRequest>) => void) | null;
  postMessage(message: unknown): void;
};

worker.onmessage = (e) => worker.postMessage(handle(e.data));
