import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type {
  SystemEnvironment,
} from "./system-environment";
import {
  BunSystemEnvironment,
  InMemorySystemEnvironment,
  createTestEnvironment,
  getSystemEnvironment,
  setSystemEnvironment,
  resetSystemEnvironment,
} from "./system-environment";
import { resolve } from "path";
import { tmpdir } from "os";

describe("SystemEnvironment Interface", () => {
  describe("BunSystemEnvironment", () => {
    let env: BunSystemEnvironment;
    let tempDir: string;
    let testFilePath: string;

    beforeEach(async () => {
      env = new BunSystemEnvironment();
      tempDir = tmpdir();
      testFilePath = resolve(tempDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    });

    afterEach(async () => {
      // Clean up test file if it exists
      try {
        await env.fs.unlink(testFilePath);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    describe("fs.readText", () => {
      it("reads text content from a file", async () => {
        // Write a test file first
        await env.fs.write(testFilePath, "Hello, World!");

        const content = await env.fs.readText(testFilePath);
        expect(content).toBe("Hello, World!");
      });

      it("throws error for non-existent file", async () => {
        const nonExistentPath = resolve(tempDir, "non-existent-file.txt");
        await expect(env.fs.readText(nonExistentPath)).rejects.toThrow();
      });
    });

    describe("fs.exists", () => {
      it("returns true for existing file", async () => {
        await env.fs.write(testFilePath, "test");
        const exists = await env.fs.exists(testFilePath);
        expect(exists).toBe(true);
      });

      it("returns false for non-existent file", async () => {
        const nonExistentPath = resolve(tempDir, "non-existent-file.txt");
        const exists = await env.fs.exists(nonExistentPath);
        expect(exists).toBe(false);
      });
    });

    describe("fs.write", () => {
      it("writes content to a file", async () => {
        await env.fs.write(testFilePath, "Written content");

        const content = await env.fs.readText(testFilePath);
        expect(content).toBe("Written content");
      });

      it("overwrites existing content", async () => {
        await env.fs.write(testFilePath, "Original");
        await env.fs.write(testFilePath, "Updated");

        const content = await env.fs.readText(testFilePath);
        expect(content).toBe("Updated");
      });
    });

    describe("fs.size", () => {
      it("returns file size in bytes", async () => {
        const content = "Hello";
        await env.fs.write(testFilePath, content);

        const size = await env.fs.size(testFilePath);
        expect(size).toBe(5);
      });
    });

    describe("fs.readBytes", () => {
      it("reads bytes from a file", async () => {
        await env.fs.write(testFilePath, "Hello, World!");

        const bytes = await env.fs.readBytes(testFilePath, 0, 5);
        expect(bytes.length).toBe(5);
        expect(new TextDecoder().decode(bytes)).toBe("Hello");
      });
    });

    describe("shell.execute", () => {
      it("executes a command and returns result", async () => {
        const result = await env.shell.execute("echo", ["test"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("test");
      });

      it("captures stderr", async () => {
        const result = await env.shell.execute("sh", ["-c", "echo error >&2"]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr.trim()).toBe("error");
      });

      it("returns non-zero exit code on failure", async () => {
        const result = await env.shell.execute("sh", ["-c", "exit 42"]);

        expect(result.exitCode).toBe(42);
      });
    });

    describe("shell.executeSync", () => {
      it("executes a command synchronously", () => {
        const result = env.shell.executeSync("echo", ["sync-test"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("sync-test");
      });
    });

    describe("shell.which", () => {
      it("finds commands in PATH", () => {
        const path = env.shell.which("echo");
        expect(path).not.toBeNull();
      });

      it("returns null for non-existent commands", () => {
        const path = env.shell.which("definitely-not-a-real-command");
        expect(path).toBeNull();
      });
    });

    describe("shell.spawn", () => {
      it("spawns a process with streaming output", async () => {
        const proc = env.shell.spawn("echo", ["spawn-test"]);

        const exitCode = await proc.exited;
        expect(exitCode).toBe(0);

        if (proc.stdout) {
          const output = await new Response(proc.stdout).text();
          expect(output.trim()).toBe("spawn-test");
        }
      });
    });

    describe("network.fetch", () => {
      it("fetches content from a URL", async () => {
        // Use a reliable test endpoint
        const response = await env.network.fetch(
          "https://jsonplaceholder.typicode.com/posts/1"
        );

        expect(response.ok).toBe(true);
        const data = (await response.json()) as { id: number };
        expect(data.id).toBe(1);
      });
    });
  });

  describe("InMemorySystemEnvironment", () => {
    let env: InMemorySystemEnvironment;

    beforeEach(() => {
      env = createTestEnvironment();
    });

    describe("Virtual File System", () => {
      it("addFile creates a file that can be read", async () => {
        env.addFile("/test/file.txt", "Test content");

        const content = await env.fs.readText("/test/file.txt");
        expect(content).toBe("Test content");
      });

      it("fs.exists returns true for added files", async () => {
        env.addFile("/exists.txt", "content");

        expect(await env.fs.exists("/exists.txt")).toBe(true);
        expect(await env.fs.exists("/not-exists.txt")).toBe(false);
      });

      it("fs.write creates or overwrites files", async () => {
        await env.fs.write("/new-file.txt", "Created");
        expect(await env.fs.readText("/new-file.txt")).toBe("Created");

        await env.fs.write("/new-file.txt", "Updated");
        expect(await env.fs.readText("/new-file.txt")).toBe("Updated");
      });

      it("fs.unlink removes files", async () => {
        env.addFile("/to-delete.txt", "delete me");

        await env.fs.unlink("/to-delete.txt");

        expect(await env.fs.exists("/to-delete.txt")).toBe(false);
      });

      it("fs.unlink throws for non-existent files", async () => {
        await expect(env.fs.unlink("/non-existent.txt")).rejects.toThrow("ENOENT");
      });

      it("fs.readText throws for non-existent files", async () => {
        await expect(env.fs.readText("/non-existent.txt")).rejects.toThrow("ENOENT");
      });

      it("fs.size returns byte length", async () => {
        env.addFile("/sized.txt", "Hello");

        const size = await env.fs.size("/sized.txt");
        expect(size).toBe(5);
      });

      it("fs.readBytes returns byte slice", async () => {
        env.addFile("/bytes.txt", "Hello, World!");

        const bytes = await env.fs.readBytes("/bytes.txt", 0, 5);
        expect(new TextDecoder().decode(bytes)).toBe("Hello");
      });

      it("addBinaryFile handles binary content", async () => {
        const binaryContent = new Uint8Array([0, 1, 2, 255, 254]);
        env.addBinaryFile("/binary.bin", binaryContent);

        const bytes = await env.fs.readBytes("/binary.bin", 0, 5);
        expect(bytes).toEqual(binaryContent);
      });

      it("getFiles returns all files", () => {
        env.addFile("/a.txt", "A");
        env.addFile("/b.txt", "B");

        const files = env.getFiles();
        expect(files.get("/a.txt")).toBe("A");
        expect(files.get("/b.txt")).toBe("B");
      });

      it("removeFile removes a file from VFS", async () => {
        env.addFile("/remove-me.txt", "content");
        env.removeFile("/remove-me.txt");

        expect(await env.fs.exists("/remove-me.txt")).toBe(false);
      });
    });

    describe("fs.glob", () => {
      beforeEach(() => {
        env.addFile("/project/src/index.ts", "index");
        env.addFile("/project/src/utils.ts", "utils");
        env.addFile("/project/src/lib/helper.ts", "helper");
        env.addFile("/project/tests/index.test.ts", "test");
        env.addFile("/project/README.md", "readme");
      });

      it("matches files with simple glob pattern", async () => {
        const files: string[] = [];
        for await (const file of env.fs.glob("*.ts", {
          cwd: "/project/src",
          absolute: true,
          onlyFiles: true,
        })) {
          files.push(file);
        }

        expect(files).toContain("/project/src/index.ts");
        expect(files).toContain("/project/src/utils.ts");
        expect(files).not.toContain("/project/src/lib/helper.ts");
      });

      it("matches files with ** glob pattern", async () => {
        const files: string[] = [];
        for await (const file of env.fs.glob("**/*.ts", {
          cwd: "/project",
          absolute: true,
          onlyFiles: true,
        })) {
          files.push(file);
        }

        expect(files).toContain("/project/src/index.ts");
        expect(files).toContain("/project/src/utils.ts");
        expect(files).toContain("/project/src/lib/helper.ts");
        expect(files).toContain("/project/tests/index.test.ts");
      });

      it("returns relative paths when absolute is false", async () => {
        const files: string[] = [];
        for await (const file of env.fs.glob("*.ts", {
          cwd: "/project/src",
          absolute: false,
          onlyFiles: true,
        })) {
          files.push(file);
        }

        expect(files).toContain("index.ts");
        expect(files).toContain("utils.ts");
      });
    });

    describe("Mock Shell Commands", () => {
      it("mockCommand registers a mock response", async () => {
        env.mockCommand("echo hello", {
          exitCode: 0,
          stdout: "hello\n",
          stderr: "",
        });

        const result = await env.shell.execute("echo", ["hello"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe("hello\n");
      });

      it("returns 127 for unknown commands", async () => {
        const result = await env.shell.execute("unknown-cmd", []);

        expect(result.exitCode).toBe(127);
        expect(result.stderr).toContain("command not found");
      });

      it("records executed commands", async () => {
        env.mockCommand("test", { exitCode: 0, stdout: "", stderr: "" });

        await env.shell.execute("test", ["arg1", "arg2"]);

        expect(env.executedCommands).toHaveLength(1);
        expect(env.executedCommands[0]!.cmd).toBe("test");
        expect(env.executedCommands[0]!.args).toEqual(["arg1", "arg2"]);
      });

      it("executeSync works with mocks", () => {
        env.mockCommand("sync-test", {
          exitCode: 0,
          stdout: "sync output",
          stderr: "",
        });

        const result = env.shell.executeSync("sync-test", []);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe("sync output");
      });

      it("which returns path for mocked commands", () => {
        env.mockCommand("mocked-cmd", { exitCode: 0, stdout: "", stderr: "" });

        expect(env.shell.which("mocked-cmd")).toBe("/usr/bin/mocked-cmd");
        expect(env.shell.which("not-mocked")).toBeNull();
      });

      it("spawn works with mocks", async () => {
        env.mockCommand("spawned", {
          exitCode: 0,
          stdout: "spawn output",
          stderr: "",
        });

        const proc = env.shell.spawn("spawned", []);

        const exitCode = await proc.exited;
        expect(exitCode).toBe(0);

        if (proc.stdout) {
          const output = await new Response(proc.stdout).text();
          expect(output).toBe("spawn output");
        }
      });
    });

    describe("Mock Network Requests", () => {
      it("mockFetch registers a mock response", async () => {
        env.mockFetch("https://api.example.com/data", {
          status: 200,
          body: JSON.stringify({ key: "value" }),
          headers: { "Content-Type": "application/json" },
        });

        const response = await env.network.fetch("https://api.example.com/data");

        expect(response.status).toBe(200);
        const data = (await response.json()) as { key: string };
        expect(data.key).toBe("value");
      });

      it("returns 404 for unmocked URLs", async () => {
        const response = await env.network.fetch("https://unmocked.com/path");

        expect(response.status).toBe(404);
      });

      it("records fetched URLs", async () => {
        env.mockFetch("https://track.me", { status: 200, body: "" });

        await env.network.fetch("https://track.me", {
          method: "POST",
          headers: { "X-Custom": "header" },
        });

        expect(env.fetchedUrls).toHaveLength(1);
        expect(env.fetchedUrls[0]!.url).toBe("https://track.me");
        expect(env.fetchedUrls[0]!.options?.method).toBe("POST");
      });
    });

    describe("clearRecords", () => {
      it("clears executed commands and fetched URLs", async () => {
        env.mockCommand("cmd", { exitCode: 0, stdout: "", stderr: "" });
        env.mockFetch("https://url", { status: 200, body: "" });

        await env.shell.execute("cmd", []);
        await env.network.fetch("https://url");

        expect(env.executedCommands).toHaveLength(1);
        expect(env.fetchedUrls).toHaveLength(1);

        env.clearRecords();

        expect(env.executedCommands).toHaveLength(0);
        expect(env.fetchedUrls).toHaveLength(0);
      });
    });
  });

  describe("Global Environment Management", () => {
    let originalEnv: SystemEnvironment;

    beforeEach(() => {
      originalEnv = getSystemEnvironment();
    });

    afterEach(() => {
      resetSystemEnvironment();
    });

    it("getSystemEnvironment returns BunSystemEnvironment by default", () => {
      resetSystemEnvironment();
      const env = getSystemEnvironment();
      expect(env).toBeInstanceOf(BunSystemEnvironment);
    });

    it("setSystemEnvironment allows injection of test environment", () => {
      const testEnv = createTestEnvironment();
      setSystemEnvironment(testEnv);

      expect(getSystemEnvironment()).toBe(testEnv);
    });

    it("resetSystemEnvironment restores BunSystemEnvironment", () => {
      const testEnv = createTestEnvironment();
      setSystemEnvironment(testEnv);

      resetSystemEnvironment();

      expect(getSystemEnvironment()).toBeInstanceOf(BunSystemEnvironment);
    });
  });

  describe("Integration: Using InMemorySystemEnvironment for Testing", () => {
    it("can simulate a file-based workflow", async () => {
      const env = createTestEnvironment();

      // Setup: Create source file
      env.addFile("/project/src/main.ts", 'export const version = "1.0.0";');

      // Simulate reading and processing
      const content = await env.fs.readText("/project/src/main.ts");
      const updated = content.replace("1.0.0", "2.0.0");
      await env.fs.write("/project/src/main.ts", updated);

      // Verify
      const finalContent = await env.fs.readText("/project/src/main.ts");
      expect(finalContent).toContain("2.0.0");
    });

    it("can simulate shell command execution", async () => {
      const env = createTestEnvironment();

      // Mock git commands
      env.mockCommand("git status", {
        exitCode: 0,
        stdout: "On branch main\nnothing to commit, working tree clean",
        stderr: "",
      });

      env.mockCommand("git rev-parse HEAD", {
        exitCode: 0,
        stdout: "abc123def456",
        stderr: "",
      });

      // Execute commands
      const status = await env.shell.execute("git", ["status"]);
      const hash = await env.shell.execute("git", ["rev-parse", "HEAD"]);

      expect(status.stdout).toContain("working tree clean");
      expect(hash.stdout.trim()).toBe("abc123def456");
    });

    it("can simulate network requests", async () => {
      const env = createTestEnvironment();

      // Mock API endpoint
      env.mockFetch("https://api.github.com/user", {
        status: 200,
        body: JSON.stringify({
          login: "testuser",
          name: "Test User",
        }),
        headers: { "Content-Type": "application/json" },
      });

      // Make request
      const response = await env.network.fetch("https://api.github.com/user");
      const user = (await response.json()) as { login: string };

      expect(user.login).toBe("testuser");
    });

    it("can combine fs, shell, and network in a workflow", async () => {
      const env = createTestEnvironment();

      // Setup files
      env.addFile("/project/package.json", JSON.stringify({ name: "test-pkg" }));

      // Mock commands
      env.mockCommand("npm install", {
        exitCode: 0,
        stdout: "added 10 packages",
        stderr: "",
      });

      // Mock network
      env.mockFetch("https://registry.npmjs.org/test-pkg", {
        status: 200,
        body: JSON.stringify({ name: "test-pkg", version: "1.0.0" }),
      });

      // Execute workflow
      const pkgContent = await env.fs.readText("/project/package.json");
      const pkg = JSON.parse(pkgContent);

      const registryResponse = await env.network.fetch(
        `https://registry.npmjs.org/${pkg.name}`
      );
      const registryData = (await registryResponse.json()) as { name: string; version: string };

      const installResult = await env.shell.execute("npm", ["install"]);

      // Verify
      expect(registryData.name).toBe("test-pkg");
      expect(installResult.stdout).toContain("added 10 packages");
      expect(env.executedCommands).toHaveLength(1);
      expect(env.fetchedUrls).toHaveLength(1);
    });
  });
});
