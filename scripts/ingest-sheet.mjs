#!/usr/bin/env node
/**
 * Ingest a chroma-key green sprite sheet into public/mascot/clips/<tag>/fXX.png
 * and update manifest.json clips[tag].
 *
 * Usage:
 *   node scripts/ingest-sheet.mjs path/to/sheet.png --tag thinking [--cols 4] [--rows 4] [--ms 55]
 *
 * Requires: Python venv with Pillow at .venv (created on first run if missing),
 * or system `python3` + pillow.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

const sheetPath = args.find((a) => !a.startsWith("--"));
const tag = flag("--tag", null);
const cols = Number(flag("--cols", "4"));
const rows = Number(flag("--rows", "4"));
const ms = Number(flag("--ms", "55"));

if (!sheetPath || !tag) {
  console.error("Usage: node scripts/ingest-sheet.mjs <sheet.png> --tag <name> [--cols 4] [--rows 4] [--ms 55]");
  process.exit(1);
}

const absSheet = path.resolve(sheetPath);
if (!fs.existsSync(absSheet)) {
  console.error("Sheet not found:", absSheet);
  process.exit(1);
}

const outDir = path.join(root, "public", "mascot", "clips", tag);
fs.mkdirSync(outDir, { recursive: true });

const py = `
from PIL import Image
import json, os, sys
sheet_path, out_dir, tag, cols, rows, ms, root = sys.argv[1:8]
cols, rows, ms = int(cols), int(rows), int(ms)
im = Image.open(sheet_path).convert("RGBA")
w, h = im.size
cw, ch = w // cols, h // rows
px = im.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if g > 140 and g > r + 40 and g > b + 40:
            px[x, y] = (0, 0, 0, 0)
        elif g > 180 and r < 120 and b < 120:
            px[x, y] = (0, 0, 0, 0)
frames = []
for row in range(rows):
    for col in range(cols):
        i = row * cols + col
        cell = im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        name = f"f{i+1:02d}.png"
        cell.save(os.path.join(out_dir, name))
        frames.append({"src": f"mascot/clips/{tag}/{name}", "ms": ms})
keyed = os.path.join(os.path.dirname(out_dir), f"{tag}_sheet_keyed.png")
im.save(keyed)
# update body from first frame if thinking/idle
if tag in ("thinking", "idle"):
    Image.open(os.path.join(out_dir, "f01.png")).save(os.path.join(root, "public", "mascot", "body.png"))
manifest_path = os.path.join(root, "public", "mascot", "manifest.json")
with open(manifest_path) as f:
    manifest = json.load(f)
manifest.setdefault("clips", {})[tag] = frames
manifest["canvas"] = {"width": cw, "height": ch}
manifest["faceLayers"] = False
manifest.setdefault("layers", {})["body"] = "mascot/body.png"
if not manifest.get("defaultClip"):
    manifest["defaultClip"] = tag
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\\n")
print(json.dumps({"tag": tag, "frames": len(frames), "cell": [cw, ch], "out": out_dir}))
`;

function findPython() {
  const venv = path.join(root, ".venv", "bin", "python");
  if (fs.existsSync(venv)) return venv;
  return "python3";
}

let python = findPython();
if (python === "python3" && !fs.existsSync(path.join(root, ".venv"))) {
  console.log("Creating .venv + pillow…");
  const venvCreate = spawnSync("python3", ["-m", "venv", path.join(root, ".venv")], { stdio: "inherit" });
  if (venvCreate.status !== 0) process.exit(venvCreate.status || 1);
  python = path.join(root, ".venv", "bin", "python");
  spawnSync(python, ["-m", "pip", "install", "pillow", "-q"], { stdio: "inherit" });
}

const result = spawnSync(
  python,
  ["-c", py, absSheet, outDir, tag, String(cols), String(rows), String(ms), root],
  { encoding: "utf8" },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status || 1);
