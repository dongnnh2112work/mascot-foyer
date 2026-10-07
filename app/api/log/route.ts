import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const logFile = path.join(process.cwd(), "logs", "latency.jsonl");

export async function POST(request: Request) {
  try {
    const entry = await request.json();
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return new NextResponse("expected object", { status: 400 });
    }
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
}
