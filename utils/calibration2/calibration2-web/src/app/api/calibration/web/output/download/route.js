import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { contentTypeForOutput, resolveAllowedOutputPath } from "@/lib/server/outputFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const inputPath = searchParams.get("path") || "";
    const resolvedPath = resolveAllowedOutputPath(inputPath);
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Requested path is not a file" }, { status: 400 });
    }

    const bytes = await fs.readFile(resolvedPath);
    const fileName = path.basename(resolvedPath);
    const contentType = contentTypeForOutput(resolvedPath);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to download output file";
    if (/ENOENT|no such file or directory/i.test(message)) {
      return NextResponse.json(
        { error: "Output file not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}