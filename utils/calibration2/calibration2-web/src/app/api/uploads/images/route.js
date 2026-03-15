import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "sfm-images");

export async function POST(req) {
  const form = await req.formData();
  const entries = form.getAll("images");

  const files = entries.filter((entry) => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No images provided" }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const saved = [];

  for (const file of files) {
    const safeName = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${file.name.replace(/\s+/g, "_")}`;
    const target = path.join(UPLOAD_DIR, safeName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(target, bytes);
    saved.push(target);
  }

  return NextResponse.json({
    ok: true,
    count: saved.length,
    saved,
    note: "Images are uploaded. Use Step 5 (sfm) to run COLMAP reconstruction.",
  });
}
