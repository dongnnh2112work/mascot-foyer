import { createServer } from "node:http";
import next from "next";
import { loadEnv } from "./loadEnv.mjs";
import { attachLiveProxy } from "./liveProxy.mjs";

loadEnv();

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 4173;
// Local default 127.0.0.1; Railway/Fly need 0.0.0.0
const hostname = process.env.HOST || (dev ? "127.0.0.1" : "0.0.0.0");

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res);
});

attachLiveProxy(server);

server.listen(port, hostname, () => {
  process.stdout.write(`mascot foyer (Next.js) http://${hostname}:${port}\n`);
  process.stdout.write(`  converse  http://${hostname}:${port}/converse\n`);
  process.stdout.write(`  animate   http://${hostname}:${port}/animate\n`);
  process.stdout.write(`  live ws   ws://${hostname}:${port}/ws/live\n`);
  process.stdout.write(`  gemini    ${process.env.GEMINI_API_KEY ? "key ok" : "NO GEMINI_API_KEY"}\n`);
});
