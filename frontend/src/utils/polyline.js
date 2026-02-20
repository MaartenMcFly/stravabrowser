/**
 * Decode Google's encoded polyline format
 * Based on: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];

  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Convert lat/lon to "world pixel" coordinates at a given OSM zoom level.
 * OSM uses Web Mercator: each tile is 256×256 px, 2^zoom tiles per axis.
 */
function latLonToWorldPixel(lat, lon, zoom) {
  const n = Math.pow(2, zoom) * 256;
  const x = (lon + 180) / 360 * n;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n;
  return { x, y };
}

/**
 * Build everything needed to render a tiled map + route inside an SVG.
 *
 * Returns { tiles, path }
 *   tiles – array of { url, x, y } for OSM tile <image> elements (256×256 each)
 *   path  – SVG path "d" string for the route, in the same coordinate space
 */
export function getMapConfig(points, svgWidth, svgHeight) {
  if (!points || points.length === 0) return null;

  let minLat = points[0][0], maxLat = points[0][0];
  let minLon = points[0][1], maxLon = points[0][1];
  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  // Find the highest zoom where the bounding box fits within 80% of the SVG
  let zoom = 16;
  for (; zoom >= 1; zoom--) {
    const tl = latLonToWorldPixel(maxLat, minLon, zoom);
    const br = latLonToWorldPixel(minLat, maxLon, zoom);
    if ((br.x - tl.x) <= svgWidth * 0.8 && (br.y - tl.y) <= svgHeight * 0.8) break;
  }

  // Centre the viewport on the bounding-box midpoint
  const center = latLonToWorldPixel((minLat + maxLat) / 2, (minLon + maxLon) / 2, zoom);
  const vpLeft = center.x - svgWidth / 2;
  const vpTop  = center.y - svgHeight / 2;

  // Which OSM tiles are visible?
  const minTX = Math.floor(vpLeft / 256);
  const maxTX = Math.floor((vpLeft + svgWidth - 1) / 256);
  const minTY = Math.floor(vpTop / 256);
  const maxTY = Math.floor((vpTop + svgHeight - 1) / 256);
  const maxTileIdx = Math.pow(2, zoom) - 1;

  const tiles = [];
  for (let ty = minTY; ty <= maxTY; ty++) {
    for (let tx = minTX; tx <= maxTX; tx++) {
      if (tx < 0 || tx > maxTileIdx || ty < 0 || ty > maxTileIdx) continue;
      tiles.push({
        url: `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`,
        x: Math.round(tx * 256 - vpLeft),
        y: Math.round(ty * 256 - vpTop),
      });
    }
  }

  // Convert polyline points to the same SVG coordinate space
  let path = '';
  for (let i = 0; i < points.length; i++) {
    const [lat, lon] = points[i];
    const wp = latLonToWorldPixel(lat, lon, zoom);
    const sx = (wp.x - vpLeft).toFixed(1);
    const sy = (wp.y - vpTop).toFixed(1);
    path += i === 0 ? `M ${sx} ${sy}` : ` L ${sx} ${sy}`;
  }

  return { tiles, path };
}

/**
 * Convert decoded polyline points to SVG path
 */
export function polylineToSvgPath(points) {
  if (!points || points.length === 0) return '';

  // Find bounding box
  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLng = points[0][1];
  let maxLng = points[0][1];

  points.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  // Add padding
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;
  const padding = 0.1;

  minLat -= latRange * padding;
  maxLat += latRange * padding;
  minLng -= lngRange * padding;
  maxLng += lngRange * padding;

  // SVG dimensions
  const width = 200;
  const height = 150;

  // Scale and flip Y (SVG Y is top-down)
  const scaleX = width / (maxLng - minLng);
  const scaleY = height / (maxLat - minLat);
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (width - (maxLng - minLng) * scale) / 2;
  const offsetY = (height - (maxLat - minLat) * scale) / 2;

  const toSvgX = (lng) => offsetX + (lng - minLng) * scale;
  const toSvgY = (lat) => height - (offsetY + (lat - minLat) * scale);

  // Build path
  let path = '';
  points.forEach(([lat, lng], i) => {
    const x = toSvgX(lng);
    const y = toSvgY(lat);
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  return path;
}
