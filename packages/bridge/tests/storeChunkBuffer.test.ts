import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createChatStoreSlice,
	type IChatStoreState,
	type ImmerGet,
	type ImmerSet,
} from "../src/store";
import { EChatRole, EMessagePartType, type IChatMessage } from "../src/types";

interface IStoreHarness {
	getState: () => IChatStoreState;
	getSetCalls: () => number;
	resetSetCalls: () => void;
}

function createStoreHarness(): IStoreHarness {
	let state: IChatStoreState;
	let setCalls = 0;
	const get: ImmerGet<IChatStoreState> = () => state;
	const set: ImmerSet<IChatStoreState> = (recipe) => {
		setCalls += 1;
		const replacement = (
			recipe as unknown as (current: IChatStoreState) => Partial<IChatStoreState> | undefined
		)(state);
		if (replacement) Object.assign(state, replacement);
	};
	state = createChatStoreSlice(set, get);
	return {
		getState: get,
		getSetCalls: () => setCalls,
		resetSetCalls: () => {
			setCalls = 0;
		},
	};
}

function createMessage(): IChatMessage {
	return {
		id: "message-1",
		parentId: null,
		threadId: "thread-1",
		role: EChatRole.ASSISTANT,
		content: [],
		stats: null,
		createdAt: 1,
	};
}

function textForPart(state: IChatStoreState, partId: string): string | undefined {
	const part = state.messagesByThread["thread-1"]?.["message-1"]?.content.find(
		(candidate) => candidate.id === partId,
	);
	return part && (part.type === EMessagePartType.TEXT || part.type === EMessagePartType.REASONING)
		? part.text
		: undefined;
}

describe("chat store message chunk buffering", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("batches repeated streaming deltas into one store update per frame", () => {
		const harness = createStoreHarness();
		const state = harness.getState();
		state.applyMessageCreated(createMessage());
		harness.resetSetCalls();

		state.applyMessageChunk("message-1", "thread-1", "part-1", "A");
		state.applyMessageChunk("message-1", "thread-1", "part-1", "B");
		state.applyMessageChunk("message-1", "thread-1", "part-1", "C");

		expect(textForPart(state, "part-1")).toBe("A");
		expect(state.getBufferedMessageChunk("message-1")).toBe("BC");
		expect(harness.getSetCalls()).toBe(1);

		vi.advanceTimersByTime(16);

		expect(textForPart(state, "part-1")).toBe("ABC");
		expect(state.getBufferedMessageChunk("message-1")).toBe("");
		expect(harness.getSetCalls()).toBe(2);
	});

	it("flushes pending text exactly once before applying a message patch", () => {
		const harness = createStoreHarness();
		const state = harness.getState();
		state.applyMessageCreated(createMessage());
		state.applyMessageChunk("message-1", "thread-1", "part-1", "A");
		state.applyMessageChunk("message-1", "thread-1", "part-1", "B");

		state.applyMessagePatched("message-1", "thread-1", {
			stats: { completionTokens: 2 },
		});
		expect(textForPart(state, "part-1")).toBe("AB");
		expect(state.getBufferedMessageChunk("message-1")).toBe("");

		vi.advanceTimersByTime(16);
		expect(textForPart(state, "part-1")).toBe("AB");
	});

	it("flushes the previous part before switching to a new part", () => {
		const harness = createStoreHarness();
		const state = harness.getState();
		state.applyMessageCreated(createMessage());
		state.applyMessageChunk("message-1", "thread-1", "part-1", "A");
		state.applyMessageChunk("message-1", "thread-1", "part-1", "B");
		state.applyMessageChunk("message-1", "thread-1", "part-2", "C");

		expect(textForPart(state, "part-1")).toBe("AB");
		expect(textForPart(state, "part-2")).toBe("C");
		expect(state.getBufferedMessageChunk("message-1")).toBe("");
	});

	it("cancels pending work and clears buffers when the store resets", () => {
		const harness = createStoreHarness();
		const state = harness.getState();
		state.applyMessageCreated(createMessage());
		state.applyMessageChunk("message-1", "thread-1", "part-1", "A");
		state.applyMessageChunk("message-1", "thread-1", "part-1", "B");

		state.reset();
		const callsAfterReset = harness.getSetCalls();
		expect(state.getBufferedMessageChunk("message-1")).toBe("");

		vi.advanceTimersByTime(16);
		expect(harness.getSetCalls()).toBe(callsAfterReset);
	});
});
