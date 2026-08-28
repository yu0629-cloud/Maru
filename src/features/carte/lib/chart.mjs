/** レーダー頂点は真上（-90°）から時計回り */

export function radarVertex(index, count, radius, cx, cy, startAngle = -Math.PI / 2) {
  const n = Math.max(1, Number(count) || 1);
  const angle = startAngle + (index * 2 * Math.PI) / n;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
    angle,
  };
}

export function radarRingPoints(count, scale, radius, cx, cy) {
  const n = Math.max(0, Number(count) || 0);
  return Array.from({ length: n }, (_, index) => radarVertex(index, n, radius * scale, cx, cy));
}

export function radarDataPoints(rates, radius, cx, cy) {
  const list = rates ?? [];
  return list.map((rate, index) =>
    radarVertex(index, list.length, radius * Math.max(0, Math.min(1, Number(rate) || 0)), cx, cy),
  );
}

export function pointsAttr(points) {
  return (points ?? []).map((point) => `${point.x},${point.y}`).join(" ");
}

export function labelTextAnchor(angle) {
  const cos = Math.cos(angle);
  if (cos > 0.4) return "start";
  if (cos < -0.4) return "end";
  return "middle";
}
