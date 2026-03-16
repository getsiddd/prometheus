import fs from "node:fs/promises";
import path from "node:path";
import { runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const checkerboard = body?.checkerboard || "9x6";
    const squareMm = Number(body?.squareMm ?? 30);
    const marginMm = Number(body?.marginMm ?? 10);

    if (!Number.isFinite(squareMm) || squareMm <= 0) {
      return new Response(JSON.stringify({ error: "squareMm must be > 0" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const outputDir = path.join(process.cwd(), "uploads", "checkerboards");
    await fs.mkdir(outputDir, { recursive: true });
    const fileName = `checkerboard-${checkerboard}-${squareMm}mm-A3-landscape.pdf`;
    const outputPdf = path.join(outputDir, fileName);

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    await runPython([
      script,
      "checkerboard-pdf",
      "--checkerboard",
      checkerboard,
      "--square-mm",
      String(squareMm),
      "--margin-mm",
      String(marginMm),
      "--output-pdf",
      outputPdf,
    ]);

    const pdf = await fs.readFile(outputPdf);

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "checkerboard pdf generation failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
