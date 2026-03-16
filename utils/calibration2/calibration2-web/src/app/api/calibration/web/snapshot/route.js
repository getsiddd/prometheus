import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json();
  const source = body?.sourceUrl;

  if (!source) {
    return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
  }

  const outputDir = path.join(process.cwd(), "uploads", "snapshots");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${Date.now()}.jpg`);

  const script = path.resolve(process.cwd(), "..", "web_backend.py");

  const args = [script, "snapshot", "--source", source, "--output", outputPath];
  const result = await runPython(args);

  const jpg = await fs.readFile(outputPath);
  const b64 = jpg.toString("base64");

  return NextResponse.json({
    ok: true,
    source,
    outputPath,
    snapshotDataUrl: `data:image/jpeg;base64,${b64}`,
    logs: result,
  });
}
