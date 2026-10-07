// Local-only static server used by Playwright. No remote binding or deployment.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(process.cwd());
const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript" };
createServer(async (request, response) => {
  try {
    const path = resolve(root, "." + decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" });
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
}).listen(4173, "127.0.0.1");
