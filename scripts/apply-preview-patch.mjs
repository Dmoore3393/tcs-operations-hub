import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const single = path.join(root, "preview-patch.b64");
let encoded = "";
if (fs.existsSync(single)) {
  encoded = fs.readFileSync(single, "utf8").trim();
} else {
  const chunks = fs.readdirSync(root)
    .filter((name) => /^preview-patch\.chunk\d+$/.test(name))
    .sort();
  encoded = chunks.map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("").trim();
}
if (!encoded) {
  console.log("[TCS preview] No preview patch found; using repository sources.");
  process.exit(0);
}
const decoded = zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
const payload = JSON.parse(decoded);
if (payload.version !== 1 || !Array.isArray(payload.files)) throw new Error("Invalid TCS preview patch payload.");
for (const entry of payload.files) {
  if (!entry || typeof entry.path !== "string" || typeof entry.content !== "string") continue;
  if (entry.path.startsWith("/") || entry.path.includes("..")) throw new Error(`Unsafe preview patch path: ${entry.path}`);
  const target = path.join(root, entry.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, entry.content, "utf8");
}
console.log(`[TCS preview] Applied ${payload.files.length} full-site preview files.`);
