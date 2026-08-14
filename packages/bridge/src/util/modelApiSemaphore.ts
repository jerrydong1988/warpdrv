/**
 * Semaphore to limit parallel model API requests.
 *
 * Why: Control API call rate, prevent overload or excessive consumption.
 * How: All model API calls (chat completions, embeddings, title generation)
 *      should acquire a permit before making the request.
 */

export class Semaphore {
  private permits: number;
  private queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(maxPermits: number) {
    this.permits = maxPermits;
  }

  /**
   * Acquire a permit. Returns a promise that resolves when the permit is acquired.
   */
  acquire(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.queue.push({ resolve, reject });
      }
    });
  }

  /**
   * Release a permit. If there are waiting promises, one will be resolved.
   */
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    } else {
      this.permits++;
    }
  }

  /**
   * Get the number of available permits.
   */
  getAvailable(): number {
    return this.permits;
  }

  /**
   * Get the number of waiting requests.
   */
  getWaiting(): number {
    return this.queue.length;
  }
}

/**
 * Global semaphore instance limiting parallel model API requests to 2.
 */
export const modelApiSemaphore = new Semaphore(2);
