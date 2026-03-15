function toNumber(value, fallback = 0) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseAsciiDxfLines(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const segments = [];

  let i = 0;
  while (i < lines.length - 1) {
    const code = lines[i];
    const value = lines[i + 1];

    if (code === "0" && value === "LINE") {
      let x1 = 0;
      let y1 = 0;
      let z1 = 0;
      let x2 = 0;
      let y2 = 0;
      let z2 = 0;
      i += 2;

      while (i < lines.length - 1) {
        const c = lines[i];
        const v = lines[i + 1];

        if (c === "0") {
          break;
        }

        if (c === "10") x1 = toNumber(v);
        if (c === "20") y1 = toNumber(v);
        if (c === "30") z1 = toNumber(v);
        if (c === "11") x2 = toNumber(v);
        if (c === "21") y2 = toNumber(v);
        if (c === "31") z2 = toNumber(v);

        i += 2;
      }

      segments.push({
        a: [x1, y1, z1],
        b: [x2, y2, z2],
      });

      continue;
    }

    i += 2;
  }

  return segments;
}
