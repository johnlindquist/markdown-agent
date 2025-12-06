import { describe, it, expect } from "bun:test";
import { formatDocsAsXml, getDocsStats, type DocsFetchResult } from "./docs";

describe("formatDocsAsXml", () => {
  it("formats single doc with safety warning", () => {
    const results: DocsFetchResult[] = [
      {
        url: "https://example.com/docs",
        content: "# API Reference\n\nSome content here.",
        success: true,
      },
    ];

    const xml = formatDocsAsXml(results);

    expect(xml).toContain("<docs>");
    expect(xml).toContain("</docs>");
    expect(xml).toContain('url="https://example.com/docs"');
    expect(xml).toContain("# API Reference");
    expect(xml).toContain("EXTERNAL CONTENT WARNING");
    expect(xml).toContain("fetched from the internet");
    expect(xml).toContain("exercise caution");
  });

  it("formats multiple docs", () => {
    const results: DocsFetchResult[] = [
      {
        url: "https://react.dev/reference",
        content: "# React Hooks",
        success: true,
      },
      {
        url: "https://nextjs.org/docs",
        content: "# Next.js Guide",
        success: true,
      },
    ];

    const xml = formatDocsAsXml(results);

    expect(xml).toContain('url="https://react.dev/reference"');
    expect(xml).toContain('url="https://nextjs.org/docs"');
    expect(xml).toContain("# React Hooks");
    expect(xml).toContain("# Next.js Guide");
  });

  it("excludes failed docs", () => {
    const results: DocsFetchResult[] = [
      {
        url: "https://good.com",
        content: "Good content",
        success: true,
      },
      {
        url: "https://bad.com",
        content: "",
        success: false,
        error: "404 Not Found",
      },
    ];

    const xml = formatDocsAsXml(results);

    expect(xml).toContain("https://good.com");
    expect(xml).not.toContain("https://bad.com");
    expect(xml).not.toContain("404 Not Found");
  });

  it("returns empty string when all docs fail", () => {
    const results: DocsFetchResult[] = [
      {
        url: "https://bad.com",
        content: "",
        success: false,
        error: "Network error",
      },
    ];

    const xml = formatDocsAsXml(results);
    expect(xml).toBe("");
  });

  it("escapes XML special characters in content", () => {
    const results: DocsFetchResult[] = [
      {
        url: "https://example.com",
        content: "Use <script> & <style> tags",
        success: true,
      },
    ];

    const xml = formatDocsAsXml(results);

    expect(xml).toContain("&lt;script&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("<script>");
  });

  it("escapes XML special characters in URL attributes", () => {
    const results: DocsFetchResult[] = [
      {
        url: "https://example.com/search?q=test&page=1",
        content: "Results",
        success: true,
      },
    ];

    const xml = formatDocsAsXml(results);

    expect(xml).toContain("&amp;page=1");
  });
});

describe("getDocsStats", () => {
  it("calculates stats correctly", () => {
    const results: DocsFetchResult[] = [
      { url: "https://a.com", content: "12345", success: true },
      { url: "https://b.com", content: "1234567890", success: true },
      { url: "https://c.com", content: "", success: false, error: "Failed" },
    ];

    const stats = getDocsStats(results);

    expect(stats.total).toBe(3);
    expect(stats.successful).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.totalChars).toBe(15);
  });

  it("handles empty results", () => {
    const stats = getDocsStats([]);

    expect(stats.total).toBe(0);
    expect(stats.successful).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.totalChars).toBe(0);
  });

  it("handles all failures", () => {
    const results: DocsFetchResult[] = [
      { url: "https://a.com", content: "", success: false, error: "Error" },
      { url: "https://b.com", content: "", success: false, error: "Error" },
    ];

    const stats = getDocsStats(results);

    expect(stats.total).toBe(2);
    expect(stats.successful).toBe(0);
    expect(stats.failed).toBe(2);
    expect(stats.totalChars).toBe(0);
  });
});
