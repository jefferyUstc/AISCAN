// Ray-casting point-in-polygon test against a GeoJSON polygon feature.
export function pointInPolygon(point, polygon) {
  const [x, y] = point;
  const coords = polygon.geometry.coordinates[0]; // outer ring
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Bounding box + center + extent for an array of {x, y, z?} points.
export function computeBounds(points) {
  if (!points.length) {
    return { center: [0, 0, 0], extent: 1 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    const { x, y, z = 0 } = point;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  });
  const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const extent = Math.max(maxX - minX, maxY - minY, Math.max(maxZ - minZ, 1e-3));
  return { center, extent, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
