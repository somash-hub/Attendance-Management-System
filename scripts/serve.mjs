// Minimal dependency-free static server for local development.
// Run `npm start` and open http://localhost:3000/login/login.html.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const safePath = normalize(join(root, requestPath.replace(/^\/+/, "")));
    if (relative(root, safePath).startsWith("..")) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const target = (await stat(safePath).catch(() => null))?.isDirectory()
      ? join(safePath, "index.html")
      : safePath;
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(target).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, () => {
  console.log(`AttendIQ is running at http://localhost:${port}/login/login.html`);
});
