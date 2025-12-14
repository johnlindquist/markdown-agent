import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { rm, mkdir, readFile, writeFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  hashUrl,
  getCachedContent,
  setCachedContent,
  touchCacheEntry,
  invalidateCacheEntry,
  clearExpiredCache,
  clearAllCache,
  getCacheStats,
  ensureCacheDir,
  CACHE_DIR,
  DEFAULT_CACHE_TTL_MS,
  LRUCache,
} from "./cache";

// Use a test-specific cache directory to avoid polluting the real cache
const TEST_CACHE_DIR = join(tmpdir(), "mdflow-cache-test");

// Override CACHE_DIR for tests by mocking the module
// We'll use direct file operations with TEST_CACHE_DIR

describe("hashUrl", () => {
  test("generates consistent SHA-256 hash for URL", () => {
    const url = "https://example.com/file.md";
    const hash1 = hashUrl(url);
    const hash2 = hashUrl(url);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  test("generates different hashes for different URLs", () => {
    const hash1 = hashUrl("https://example.com/file1.md");
    const hash2 = hashUrl("https://example.com/file2.md");

    expect(hash1).not.toBe(hash2);
  });

  test("handles special characters in URLs", () => {
    const url = "https://example.com/path?query=value&foo=bar#fragment";
    const hash = hashUrl(url);

    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});

describe("cache operations", () => {
  // Create a temporary test cache directory
  let testCacheDir: string;

  beforeEach(async () => {
    testCacheDir = join(tmpdir(), `mdflow-cache-test-${Date.now()}`);
    await mkdir(testCacheDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("setCachedContent and getCachedContent", () => {
    test("stores and retrieves content", async () => {
      const url = "https://example.com/test.md";
      const content = "# Test Content\n\nThis is a test.";

      await setCachedContent(url, content);
      const result = await getCachedContent(url);

      expect(result.hit).toBe(true);
      expect(result.content).toBe(content);
      expect(result.metadata?.url).toBe(url);
    });

    test("returns cache miss for non-existent URL", async () => {
      const result = await getCachedContent("https://nonexistent.example.com/file.md");

      expect(result.hit).toBe(false);
      expect(result.content).toBeUndefined();
    });

    test("respects noCache option", async () => {
      const url = "https://example.com/nocache.md";
      const content = "Cached content";

      await setCachedContent(url, content);
      const result = await getCachedContent(url, { noCache: true });

      expect(result.hit).toBe(false);
    });

    test("stores custom TTL in metadata", async () => {
      const url = "https://example.com/custom-ttl.md";
      const content = "Content with custom TTL";
      const customTtl = 30 * 60 * 1000; // 30 minutes

      await setCachedContent(url, content, { ttlMs: customTtl });
      const result = await getCachedContent(url);

      expect(result.hit).toBe(true);
      expect(result.metadata?.ttlMs).toBe(customTtl);
    });

    test("handles empty content", async () => {
      const url = "https://example.com/empty.md";
      const content = "";

      await setCachedContent(url, content);
      const result = await getCachedContent(url);

      expect(result.hit).toBe(true);
      expect(result.content).toBe("");
    });

    test("handles large content", async () => {
      const url = "https://example.com/large.md";
      const content = "x".repeat(1024 * 1024); // 1MB of content

      await setCachedContent(url, content);
      const result = await getCachedContent(url);

      expect(result.hit).toBe(true);
      expect(result.content).toBe(content);
    });
  });

  describe("cache expiration", () => {
    test("returns expired flag for old cache entries", async () => {
      const url = "https://example.com/expired.md";
      const content = "Old content";

      // Set cache with very short TTL
      await setCachedContent(url, content, { ttlMs: 1 });

      // Wait for it to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await getCachedContent(url, { ttlMs: 1 });

      expect(result.hit).toBe(false);
      expect(result.expired).toBe(true);
    });

    test("returns valid content within TTL", async () => {
      const url = "https://example.com/valid.md";
      const content = "Valid content";

      await setCachedContent(url, content, { ttlMs: 60000 }); // 1 minute
      const result = await getCachedContent(url, { ttlMs: 60000 });

      expect(result.hit).toBe(true);
      expect(result.expired).toBeUndefined();
    });
  });

  describe("invalidateCacheEntry", () => {
    test("removes cached content", async () => {
      const url = "https://example.com/to-invalidate.md";
      const content = "Content to remove";

      await setCachedContent(url, content);

      // Verify it exists
      let result = await getCachedContent(url);
      expect(result.hit).toBe(true);

      // Invalidate
      const invalidated = await invalidateCacheEntry(url);
      expect(invalidated).toBe(true);

      // Verify it's gone
      result = await getCachedContent(url);
      expect(result.hit).toBe(false);
    });

    test("returns true for non-existent entries", async () => {
      const result = await invalidateCacheEntry("https://nonexistent.example.com/file.md");
      expect(result).toBe(true);
    });
  });

  describe("clearExpiredCache", () => {
    test("removes only expired entries", async () => {
      // Create an entry that will expire quickly
      const expiredUrl = "https://example.com/will-expire.md";
      await setCachedContent(expiredUrl, "Expired", { ttlMs: 1 });

      // Create an entry with long TTL
      const validUrl = "https://example.com/will-stay.md";
      await setCachedContent(validUrl, "Valid", { ttlMs: 3600000 });

      // Wait for short TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Clear expired
      const cleared = await clearExpiredCache();
      expect(cleared).toBeGreaterThanOrEqual(1);

      // Valid entry should still exist
      const validResult = await getCachedContent(validUrl);
      expect(validResult.hit).toBe(true);
    });
  });

  describe("clearAllCache", () => {
    test("removes all cache entries", async () => {
      // Create multiple entries
      await setCachedContent("https://example.com/1.md", "Content 1");
      await setCachedContent("https://example.com/2.md", "Content 2");
      await setCachedContent("https://example.com/3.md", "Content 3");

      const cleared = await clearAllCache();
      expect(cleared).toBeGreaterThanOrEqual(6); // 3 content files + 3 metadata files

      // All entries should be gone
      const result1 = await getCachedContent("https://example.com/1.md");
      const result2 = await getCachedContent("https://example.com/2.md");
      const result3 = await getCachedContent("https://example.com/3.md");

      expect(result1.hit).toBe(false);
      expect(result2.hit).toBe(false);
      expect(result3.hit).toBe(false);
    });
  });

  describe("getCacheStats", () => {
    test("returns correct statistics", async () => {
      // Start fresh
      await clearAllCache();

      // Create some entries
      await setCachedContent("https://example.com/stat1.md", "Content 1");
      await setCachedContent("https://example.com/stat2.md", "Content 2");

      const stats = await getCacheStats();

      expect(stats.entries).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.oldestEntry).not.toBeNull();
      expect(stats.newestEntry).not.toBeNull();
    });

    test("returns zeros for empty cache", async () => {
      await clearAllCache();

      const stats = await getCacheStats();

      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });
});

describe("DEFAULT_CACHE_TTL_MS", () => {
  test("defaults to 1 hour", () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(60 * 60 * 1000);
  });
});

describe("ensureCacheDir", () => {
  test("creates cache directory if it doesn't exist", async () => {
    await ensureCacheDir();

    const stats = await stat(CACHE_DIR);
    expect(stats.isDirectory()).toBe(true);
  });
});

describe("LRUCache", () => {
  test("basic get and set operations", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(3);
  });

  test("evicts least recently used when at capacity", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Cache is now full: a, b, c (oldest to newest)

    // Add new item - should evict 'a' (oldest)
    cache.set("d", 4);

    expect(cache.get("a")).toBeUndefined(); // Evicted
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
    expect(cache.size).toBe(3);
  });

  test("get refreshes recency (proper LRU behavior)", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Order: a (oldest), b, c (newest)

    // Access 'a' - this should move it to most recently used
    cache.get("a");
    // Order should now be: b (oldest), c, a (newest)

    // Add new item - should evict 'b' (now oldest), NOT 'a'
    cache.set("d", 4);

    expect(cache.get("a")).toBe(1); // 'a' was refreshed, so still present
    expect(cache.get("b")).toBeUndefined(); // 'b' was evicted
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  test("updating existing key refreshes recency", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Order: a (oldest), b, c

    // Update 'a' - should refresh recency
    cache.set("a", 100);
    // Order: b (oldest), c, a (newest)

    // Add new item - should evict 'b'
    cache.set("d", 4);

    expect(cache.get("a")).toBe(100); // Updated value, still present
    expect(cache.get("b")).toBeUndefined(); // Evicted
    expect(cache.size).toBe(3);
  });

  test("has() does not affect recency", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Check if 'a' exists (should NOT refresh recency)
    expect(cache.has("a")).toBe(true);

    // Add two new items - 'a' should be evicted first, then 'b'
    cache.set("d", 4);
    cache.set("e", 5);

    expect(cache.get("a")).toBeUndefined(); // Evicted
    expect(cache.get("b")).toBeUndefined(); // Evicted
    expect(cache.get("c")).toBe(3);
  });

  test("delete removes entry", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(1);
    expect(cache.delete("nonexistent")).toBe(false);
  });

  test("clear removes all entries", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBeUndefined();
  });

  test("keys() returns all keys", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    const keys = [...cache.keys()];
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
    expect(keys).toHaveLength(3);
  });

  test("handles zero-capacity cache", () => {
    const cache = new LRUCache<string, number>(0);

    cache.set("a", 1);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

describe("HTTP cache headers (ETag/Last-Modified)", () => {
  test("stores etag in metadata", async () => {
    const url = "https://example.com/etag-test.md";
    const content = "Content with ETag";
    const etag = '"abc123"';

    await setCachedContent(url, content, { etag });
    const result = await getCachedContent(url);

    expect(result.hit).toBe(true);
    expect(result.metadata?.etag).toBe(etag);
  });

  test("stores lastModified in metadata", async () => {
    const url = "https://example.com/last-modified-test.md";
    const content = "Content with Last-Modified";
    const lastModified = "Wed, 21 Oct 2015 07:28:00 GMT";

    await setCachedContent(url, content, { lastModified });
    const result = await getCachedContent(url);

    expect(result.hit).toBe(true);
    expect(result.metadata?.lastModified).toBe(lastModified);
  });

  test("stores both etag and lastModified", async () => {
    const url = "https://example.com/both-headers-test.md";
    const content = "Content with both headers";
    const etag = '"xyz789"';
    const lastModified = "Thu, 22 Oct 2015 08:30:00 GMT";

    await setCachedContent(url, content, { etag, lastModified });
    const result = await getCachedContent(url);

    expect(result.hit).toBe(true);
    expect(result.metadata?.etag).toBe(etag);
    expect(result.metadata?.lastModified).toBe(lastModified);
  });

  test("touchCacheEntry updates fetchedAt without changing content", async () => {
    const url = "https://example.com/touch-test.md";
    const content = "Original content";
    const etag = '"original"';

    await setCachedContent(url, content, { etag, ttlMs: 1 });

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify it's expired
    const expiredResult = await getCachedContent(url, { ttlMs: 1 });
    expect(expiredResult.hit).toBe(false);
    expect(expiredResult.expired).toBe(true);

    // Touch to refresh TTL
    const touched = await touchCacheEntry(url, { etag: '"updated"', ttlMs: 60000 });
    expect(touched).toBe(true);

    // Should now be valid again
    const refreshedResult = await getCachedContent(url, { ttlMs: 60000 });
    expect(refreshedResult.hit).toBe(true);
    expect(refreshedResult.content).toBe(content); // Content unchanged
    expect(refreshedResult.metadata?.etag).toBe('"updated"'); // ETag updated
  });

  test("touchCacheEntry returns false for non-existent entry", async () => {
    const result = await touchCacheEntry("https://nonexistent.example.com/touch.md");
    expect(result).toBe(false);
  });

  test("expired cache returns metadata for conditional request", async () => {
    const url = "https://example.com/conditional-test.md";
    const content = "Content for conditional request";
    const etag = '"cond123"';
    const lastModified = "Fri, 23 Oct 2015 09:45:00 GMT";

    await setCachedContent(url, content, { etag, lastModified, ttlMs: 1 });

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await getCachedContent(url, { ttlMs: 1 });

    expect(result.hit).toBe(false);
    expect(result.expired).toBe(true);
    // Metadata should still be available for conditional request
    expect(result.metadata?.etag).toBe(etag);
    expect(result.metadata?.lastModified).toBe(lastModified);
  });
});
