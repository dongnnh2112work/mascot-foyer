import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const faqFile = path.join(process.cwd(), "data", "faq.json");
  const raw = fs.readFileSync(faqFile, "utf8");
  return new NextResponse(raw, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
