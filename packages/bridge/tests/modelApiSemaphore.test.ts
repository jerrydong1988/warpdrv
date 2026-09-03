import { describe, expect, it, vi } from "vitest";
import { Semaphore } from "../src/util/modelApiSemaphore";

describe("Semaphore", () => {
	it("queues callers after permits are exhausted and releases them in order", async () => {
		const semaphore = new Semaphore(1);
		await semaphore.acquire();
		expect(semaphore.getAvailable()).toBe(0);

		const resumed = vi.fn();
		const waiting = semaphore.acquire().then(resumed);
		expect(semaphore.getWaiting()).toBe(1);

		semaphore.release();
		await waiting;
		expect(resumed).toHaveBeenCalledOnce();
		expect(semaphore.getWaiting()).toBe(0);
		expect(semaphore.getAvailable()).toBe(0);

		semaphore.release();
		expect(semaphore.getAvailable()).toBe(1);
	});

	it("tracks multiple immediately available permits", async () => {
		const semaphore = new Semaphore(2);
		await semaphore.acquire();
		expect(semaphore.getAvailable()).toBe(1);
	});
});
