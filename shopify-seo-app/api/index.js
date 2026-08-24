// Vercel serverless function entry point.
//
// Vercel's Node.js runtime invokes this default-exported function with a
// standard `(req, res)` pair — the same shape `node:http`'s `createServer`
// callback receives — so it reuses the exact same request-handling logic
// the standalone server uses locally. See `vercel.json` for how paths are
// routed here (everything except files under `public/`, which Vercel
// serves directly from its CDN).
import { createRequestHandler } from "../src/server.js";

const handleRequest = createRequestHandler();

export default async function handler(req, res) {
  await handleRequest(req, res);
}
