import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { ModexaDatabase, BackupService } from "@modexa/core";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const apiKey = process.env.MODEXA_API_KEY;
const database = new ModexaDatabase({
  path: process.env.MODEXA_DATABASE_PATH ?? "data/modexa.sqlite"
});
const backup = new BackupService(database);

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*"
  });
  res.end(body);
}

function authorized(req: IncomingMessage): boolean {
  if (!apiKey) return true;
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return supplied === apiKey;
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,content-type"
      });
      res.end();
      return;
    }

    if (url.pathname === "/health") {
      json(res, 200, { status: "ok", service: "modexa-api", time: new Date().toISOString() });
      return;
    }

    if (!authorized(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }

    if (url.pathname === "/api/communities" && req.method === "GET") {
      json(res, 200, { items: database.getCommunitiesSnapshot() });
      return;
    }

    if (url.pathname === "/api/moderation" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId");
      if (!communityId) {
        json(res, 400, { error: "communityId is required" });
        return;
      }
      json(res, 200, { items: database.getModerationCases(communityId) });
      return;
    }

    if (url.pathname === "/api/backup" && req.method === "GET") {
      const artifact = backup.exportSnapshot();
      json(res, 200, artifact);
      return;
    }

    json(res, 404, { error: "not_found" });
  })().catch((error) => {
    json(res, 500, { error: error instanceof Error ? error.message : "internal_error" });
  });
});

server.listen(port, host, () => {
  console.log(`Modexa API listening on http://${host}:${port}`);
});
