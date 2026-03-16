import fs from "node:fs/promises";
import path from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".npz",
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".webp",
  ".gif",
  ".pdf",
  ".dwg",
  ".zip",
  ".bin",
]);

export function resolveAllowedOutputPath(inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) {
    throw new Error("Output path is required");
  }

  const webRoot = path.resolve(process.cwd());
  const calibRoot = path.resolve(process.cwd(), "..");
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(process.cwd(), raw);

  const isInside = [webRoot, calibRoot].some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!isInside) {
    throw new Error("Path is outside allowed workspace roots");
  }

  return resolved;
}

export function isBinaryOutputPath(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(String(filePath || "")).toLowerCase());
}

export function contentTypeForOutput(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  switch (ext) {
    case ".json":
      return "application/json";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".txt":
    case ".log":
      return "text/plain; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    case ".npz":
      return "application/octet-stream";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".bmp":
      return "image/bmp";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export async function readOutputTextPreview(filePath, maxChars = 120000) {
  const text = await fs.readFile(filePath, "utf8");
  if (text.length <= maxChars) {
    return { textPreview: text, truncated: false };
  }
  return {
    textPreview: `${text.slice(0, maxChars)}\n\n... truncated ...`,
    truncated: true,
  };
}