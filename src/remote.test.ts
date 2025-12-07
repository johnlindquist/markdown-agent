import { expect, test, describe } from "bun:test";
import {
  isRemoteUrl,
  toRawUrl,
} from "./remote";

describe("isRemoteUrl", () => {
  test("returns true for http URL", () => {
    expect(isRemoteUrl("http://example.com/file.md")).toBe(true);
  });

  test("returns true for https URL", () => {
    expect(isRemoteUrl("https://example.com/file.md")).toBe(true);
  });

  test("returns false for local path", () => {
    expect(isRemoteUrl("./DEMO.md")).toBe(false);
  });

  test("returns false for absolute path", () => {
    expect(isRemoteUrl("/home/user/file.md")).toBe(false);
  });

  test("returns false for relative path", () => {
    expect(isRemoteUrl("instructions/DEMO.md")).toBe(false);
  });
});

describe("toRawUrl", () => {
  test("converts GitHub Gist URL to raw", () => {
    const url = "https://gist.github.com/user/abc123def456";
    const raw = toRawUrl(url);
    expect(raw).toBe("https://gist.githubusercontent.com/user/abc123def456/raw");
  });

  test("converts GitHub blob URL to raw", () => {
    const url = "https://github.com/user/repo/blob/main/scripts/deploy.md";
    const raw = toRawUrl(url);
    expect(raw).toBe("https://raw.githubusercontent.com/user/repo/main/scripts/deploy.md");
  });

  test("converts GitLab blob URL to raw", () => {
    const url = "https://gitlab.com/user/repo/-/blob/main/file.md";
    const raw = toRawUrl(url);
    expect(raw).toBe("https://gitlab.com/user/repo/-/raw/main/file.md");
  });

  test("returns unchanged URL for already raw content", () => {
    const url = "https://raw.githubusercontent.com/user/repo/main/file.md";
    const raw = toRawUrl(url);
    expect(raw).toBe(url);
  });

  test("returns unchanged URL for unknown sources", () => {
    const url = "https://example.com/file.md";
    const raw = toRawUrl(url);
    expect(raw).toBe(url);
  });
});
