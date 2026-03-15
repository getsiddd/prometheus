import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toWebStream(nodeReadable, onClose) {
  let done = false;

  return new ReadableStream({
    start(controller) {
      const cleanup = () => {
        nodeReadable.off("data", onData);
        nodeReadable.off("end", onEnd);
        nodeReadable.off("error", onError);
      };

      const onData = (chunk) => {
        if (done) {
          return;
        }
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          done = true;
          cleanup();
          onClose?.();
        }
      };

      const onEnd = () => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // Stream may already be closed by cancellation.
        }
      };

      const onError = (err) => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        try {
          controller.error(err);
        } catch {
          // Ignore invalid state if consumer already cancelled.
        }
      };

      nodeReadable.on("data", onData);
      nodeReadable.on("end", onEnd);
      nodeReadable.on("error", onError);
    },
    cancel() {
      done = true;
      onClose?.();
    },
  });
}

function runProbe(source) {
  return new Promise((resolve) => {
    const isRtsp = source.toLowerCase().startsWith("rtsp://");
    const args = ["-v", "error"];

    if (isRtsp) {
      args.push("-rtsp_transport", "tcp");
    }

    args.push(
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height",
      "-of",
      "json",
      source,
    );

    const probe = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";

    probe.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    probe.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });

    probe.on("close", (code) => {
      resolve({ ok: code === 0, out, err });
    });
  });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  const fps = Number(searchParams.get("fps") || 12);
  const width = Number(searchParams.get("width") || 960);

  if (!source) {
    return new Response("Missing source query parameter", { status: 400 });
  }

  const probe = await runProbe(source);
  if (!probe.ok) {
    const msg = `Unable to open source/camera: ${source}\n${probe.err || "No video stream detected."}`;
    return new Response(msg, { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const isRtsp = source.toLowerCase().startsWith("rtsp://");
  const isMp4 = source.toLowerCase().endsWith(".mp4");
  const ffmpegArgs = ["-hide_banner", "-loglevel", "error"];

  if (isRtsp) {
    ffmpegArgs.push(
      "-rtsp_transport",
      "tcp",
      "-rtsp_flags",
      "prefer_tcp",
    );
  } else {
    if (isMp4) {
      ffmpegArgs.push("-stream_loop", "-1", "-re");
    } else {
      ffmpegArgs.push("-stream_loop", "-1");
    }
  }

  ffmpegArgs.push(
    "-i",
    source,
    "-an",
    "-vf",
    `fps=${Math.max(2, Math.min(30, fps))},scale=${Math.max(320, Math.min(1920, width))}:-1`,
    "-q:v",
    "5",
    "-f",
    "mpjpeg",
    "-boundary_tag",
    "frame",
    "pipe:1",
  );

  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  ffmpeg.stderr.on("data", (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) {
      console.error(`[mjpeg] ${msg}`);
    }
  });

  const body = toWebStream(ffmpeg.stdout, () => {
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGTERM");
    }
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      Connection: "keep-alive",
      "Content-Type": "multipart/x-mixed-replace; boundary=frame",
      "X-Accel-Buffering": "no",
    },
  });
}
