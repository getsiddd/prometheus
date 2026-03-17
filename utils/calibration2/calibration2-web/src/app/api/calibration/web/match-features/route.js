import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const cameras = body?.cameras;
    const matchOptions = body?.matchOptions || {};

    if (!Array.isArray(cameras) || cameras.length < 2) {
      return NextResponse.json({ error: "At least 2 cameras with snapshot paths are required" }, { status: 400 });
    }

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const args = [
      script,
      "match-features-multiview",
      "--cameras-json",
      JSON.stringify(cameras),
    ];

    if (typeof matchOptions?.method === "string" && matchOptions.method.trim()) {
      args.push("--match-method", matchOptions.method.trim());
    }
    if (Number.isFinite(Number(matchOptions?.maxFeatures))) {
      args.push("--max-features", String(Number(matchOptions.maxFeatures)));
    }
    if (Number.isFinite(Number(matchOptions?.maxMatchesPerPair))) {
      args.push("--max-matches-per-pair", String(Number(matchOptions.maxMatchesPerPair)));
    }
    if (Number.isFinite(Number(matchOptions?.minConfidence))) {
      args.push("--min-confidence", String(Number(matchOptions.minConfidence)));
    }
    if (Number.isFinite(Number(matchOptions?.maxImageSide))) {
      args.push("--max-image-side", String(Number(matchOptions.maxImageSide)));
    }
    if (typeof matchOptions?.anchorCameraId === "string" && matchOptions.anchorCameraId.trim()) {
      args.push("--anchor-camera-id", matchOptions.anchorCameraId.trim());
    }

    const executed = await runPython(args);
    const parsed = parseLastJson(executed.out);
    const result = parsed?.result || parsed;

    return NextResponse.json({
      ok: true,
      matching: result,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Feature matching failed" }, { status: 500 });
  }
}
