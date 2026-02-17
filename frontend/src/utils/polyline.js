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
