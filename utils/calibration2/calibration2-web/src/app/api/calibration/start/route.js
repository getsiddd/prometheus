import { NextResponse } from "next/server";
import { createJob } from "@/lib/calibration-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json();

  if (!body?.stage || !body?.config) {
    return NextResponse.json({ error: "Missing stage or config" }, { status: 400 });
  }

  const job = createJob(body.stage, body.config);
  return NextResponse.json({ job }, { status: 201 });
}
