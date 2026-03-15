import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSessionDir(sessionId) {
  return path.join(process.cwd(), "uploads", "intrinsic", sessionId || "default");
}

function isImageFile(name) {
  return /\.(jpg|jpeg|png|bmp)$/i.test(name || "");
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") || "default";
    const dir = getSessionDir(sessionId);

    let names = [];
    try {
      names = (await fs.readdir(dir)).filter(isImageFile);
    } catch {
      return new Response(JSON.stringify({ ok: true, sessionId, count: 0, samples: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    names.sort((a, b) => b.localeCompare(a));

    const samples = [];
    for (const name of names) {
      const filePath = path.join(dir, name);
      const st = await fs.stat(filePath);
      const ext = path.extname(name).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      const data = await fs.readFile(filePath);
      samples.push({
        name,
        size: st.size,
        updatedAt: st.mtimeMs,
        dataUrl: `data:${mime};base64,${data.toString("base64")}`,
      });
    }

    return new Response(JSON.stringify({ ok: true, sessionId, count: samples.length, samples }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "failed to load intrinsic samples" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json();
    const sessionId = body?.sessionId || "default";
    const fileName = path.basename(body?.fileName || "");

    if (!isImageFile(fileName)) {
      return new Response(JSON.stringify({ error: "Invalid sample file name" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const dir = getSessionDir(sessionId);
    const filePath = path.join(dir, fileName);
    await fs.rm(filePath, { force: true });

    const remaining = (await fs.readdir(dir).catch(() => [])).filter(isImageFile);

    return new Response(JSON.stringify({ ok: true, sessionId, deleted: fileName, remaining: remaining.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "failed to delete intrinsic sample" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
