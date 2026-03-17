import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const zMappings = Array.isArray(body?.zMappings) ? body.zMappings : [];

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const executed = await runPython([
      script,
      "z-mapping-summary",
      "--z-mappings-json",
      JSON.stringify(zMappings),
    ]);

    const parsed = parseLastJson(executed.out);
    const result = parsed?.result || parsed;

    return NextResponse.json({
      ok: true,
      result,
      logs: [String(executed.err || "").trim(), String(executed.out || "").trim()].filter(Boolean),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Z-mapping backend computation failed" },
      { status: 500 }
    );
  }
}
