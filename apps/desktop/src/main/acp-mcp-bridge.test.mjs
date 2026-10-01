import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { startAcpMcpBridge } from "./acp-mcp-bridge.mjs";

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const upstream = async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ url: request.url, authorization: request.headers.authorization, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/v1/auth/session") {
      response.end(JSON.stringify({
        authenticated: request.headers.authorization === "Bearer long-lived-session",
        user: { id: "account-one" },
      }));
      return;
    }
    response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
};

test("ACP bridge forwards only authorized MCP requests and never exposes the login token", async () => {
  const remote = await upstream();
  let current = true;
  const bridge = await startAcpMcpBridge({
    baseUrl: remote.url,
    sessionToken: "long-lived-session",
    isCurrent: () => current,
  });
  try {
    expect(bridge.url).not.toContain("long-lived-session");
    expect(bridge.secret).not.toBe("long-lived-session");
    const request = (authorization) => fetch(`${bridge.url}/mcp`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect((await request("Bearer wrong")).status).toBe(401);
    expect(remote.requests).toHaveLength(1);
    expect((await request(`Bearer ${bridge.secret}`)).status).toBe(200);
    expect(remote.requests.at(-1)?.authorization).toBe("Bearer long-lived-session");
    current = false;
    expect((await request(`Bearer ${bridge.secret}`)).status).toBe(401);
    expect(remote.requests).toHaveLength(2);
  } finally {
    await bridge.close();
  }
});

test("ACP bridge refuses an invalid desktop session", async () => {
  const remote = await upstream();
  await expect(startAcpMcpBridge({
    baseUrl: remote.url,
    sessionToken: "invalid-session",
    isCurrent: () => true,
  })).rejects.toThrow("note_access_unavailable");
  await expect(startAcpMcpBridge({
    baseUrl: remote.url,
    sessionToken: "long-lived-session",
    accountId: "account-two",
    isCurrent: () => true,
  })).rejects.toThrow("note_access_unavailable");
});

test("the packaged MCP stdio adapter reaches the signed-in instance through the ACP bridge", async () => {
  const remote = await upstream();
  const bridge = await startAcpMcpBridge({
    baseUrl: remote.url,
    sessionToken: "long-lived-session",
    isCurrent: () => true,
  });
  const script = fileURLToPath(new URL("../../../../scripts/edgeever-mcp-stdio.mjs", import.meta.url));
  const child = spawn(process.execPath, [script], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, EDGEEVER_URL: bridge.url, EDGEEVER_TOKEN: bridge.secret },
  });
  try {
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MCP stdio adapter timed out")), 5000);
      child.stdout.once("data", (chunk) => {
        clearTimeout(timeout);
        try { resolve(JSON.parse(chunk.toString("utf8").trim())); }
        catch (error) { reject(error); }
      });
      child.once("error", reject);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`);
    expect((await response).result).toEqual({ tools: [] });
    expect(remote.requests.at(-1)?.authorization).toBe("Bearer long-lived-session");
  } finally {
    child.kill();
    await bridge.close();
  }
});
