/**
 * Concurrency utilities for limiting parallel operations.
 *
 * Provides a simple semaphore implementation to prevent file descriptor
 * exhaustion when processing many imports in parallel.
 */

/**
 * Default concurrency limit for parallel import resolution.
 * This prevents file descriptor exhaustion when processing many imports.
 */
export const DEFAULT_CONCURRENCY_LIMIT = 10;

/**
 * Simple semaphore for limiting concurrent operations.
 *
 * This is used by the import resolution system to prevent opening too many
 * file handles or network connections simultaneously.
 *
 * @example
 * ```typescript
 * const semaphore = new Semaphore(5); // Allow 5 concurrent operations
 *
 * // Using run() for automatic acquire/release
 * const result = await semaphore.run(async () => {
 *   return await fetchSomething();
 * });
 *
 * // Or manual acquire/release
 * await semaphore.acquire();
 * try {
 *   await doSomething();
 * } finally {
 *   semaphore.release();
 * }
 * ```
 */
export class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  /**
   * Create a new semaphore with the specified number of permits.
   *
   * @param permits - Maximum number of concurrent operations allowed
   */
  constructor(permits: number) {
    if (permits < 1) {
      throw new Error('Semaphore permits must be at least 1');
    }
    this.permits = permits;
  }

  /**
   * Acquire a permit, blocking if none are available.
   * Returns immediately if a permit is available.
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /**
   * Release a permit, allowing a waiting operation to proceed.
   */
  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }

  /**
   * Execute a function with semaphore protection.
   * Automatically acquires before and releases after execution.
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get the number of currently available permits.
   */
  get availablePermits(): number {
    return this.permits;
  }

  /**
   * Get the number of operations waiting for a permit.
   */
  get waitingCount(): number {
    return this.waiting.length;
  }
}
