import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const correspondences = Array.isArray(body?.correspondences) ? body.correspondences : [];

    if (correspondences.length < 4) {
      return NextResponse.json({ error: "At least 4 correspondences are required" }, { status: 400 });
    }

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const executed = await runPython([
      script,
      "solve-homography",
      "--correspondences-json",
      JSON.stringify(correspondences),
    ]);

    const parsed = parseLastJson(executed.out);
    const result = parsed?.result || parsed;

    return NextResponse.json({
      ok: true,
      homography: result,
      logs: [String(executed.err || "").trim(), String(executed.out || "").trim()].filter(Boolean),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Homography solve failed" },
      { status: 500 }
    );
  }
}
