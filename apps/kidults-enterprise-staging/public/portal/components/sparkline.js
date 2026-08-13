function normalize(values, width, height, padding) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map((value, index) => {
    const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return [x, y];
  });
}

function path(points) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function sparklineSvg(values, label) {
  const width = 620;
  const height = 130;
  const padding = 8;
  const points = normalize(values, width, height, padding);
  const line = path(points);
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = points.at(-1);

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
      <line class="grid" x1="0" y1="${height * .32}" x2="${width}" y2="${height * .32}"></line>
      <line class="grid" x1="0" y1="${height * .66}" x2="${width}" y2="${height * .66}"></line>
      <path class="area" d="${area}"></path>
      <path class="line" d="${line}"></path>
      <circle class="dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5"></circle>
    </svg>`;
}
