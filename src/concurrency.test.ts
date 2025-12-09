import { test, expect, describe } from "bun:test";
import { Semaphore, DEFAULT_CONCURRENCY_LIMIT } from "./concurrency";

describe("Semaphore", () => {
  test("allows operations up to permit limit", async () => {
    const semaphore = new Semaphore(2);
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const operation = async (id: number) => {
      await semaphore.acquire();
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrentCount--;
      semaphore.release();
      return id;
    };

    // Start 5 operations
    const results = await Promise.all([
      operation(1),
      operation(2),
      operation(3),
      operation(4),
      operation(5),
    ]);

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  test("run() auto-releases on success", async () => {
    const semaphore = new Semaphore(1);

    const result = await semaphore.run(async () => {
      return "success";
    });

    expect(result).toBe("success");
    expect(semaphore.availablePermits).toBe(1);
  });

  test("run() auto-releases on error", async () => {
    const semaphore = new Semaphore(1);

    await expect(
      semaphore.run(async () => {
        throw new Error("test error");
      })
    ).rejects.toThrow("test error");

    // Permit should be released even after error
    expect(semaphore.availablePermits).toBe(1);
  });

  test("throws on invalid permit count", () => {
    expect(() => new Semaphore(0)).toThrow("Semaphore permits must be at least 1");
    expect(() => new Semaphore(-1)).toThrow("Semaphore permits must be at least 1");
  });

  test("waitingCount tracks waiting operations", async () => {
    const semaphore = new Semaphore(1);
    expect(semaphore.waitingCount).toBe(0);

    // Acquire the only permit
    await semaphore.acquire();
    expect(semaphore.availablePermits).toBe(0);

    // Start a waiting operation
    const waitingPromise = semaphore.acquire();
    expect(semaphore.waitingCount).toBe(1);

    // Release to let the waiting operation proceed
    semaphore.release();
    await waitingPromise;
    expect(semaphore.waitingCount).toBe(0);

    // Clean up
    semaphore.release();
  });

  test("limits concurrent operations with run()", async () => {
    const semaphore = new Semaphore(3);
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const operation = (id: number) =>
      semaphore.run(async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentCount--;
        return id;
      });

    // Start 10 operations
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => operation(i))
    );

    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});

describe("DEFAULT_CONCURRENCY_LIMIT", () => {
  test("is a reasonable default", () => {
    expect(DEFAULT_CONCURRENCY_LIMIT).toBe(10);
  });
});
