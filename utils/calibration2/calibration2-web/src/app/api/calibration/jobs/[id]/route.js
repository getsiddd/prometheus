import { NextResponse } from "next/server";
import { getJob } from "@/lib/calibration-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_, context) {
  const { id } = await context.params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
