import type { LatLng } from './neighborhoods';

/**
 * Straight-line distance between two points, in kilometres.
 *
 * Deliberately client-side over the already-fetched list rather than a geo
 * query. The browse page already downloads the working set — one query,
 * `orderBy('createdAt','desc')` with `limit(200)` — and already filters five
 * criteria in memory, so every opportunity is in the browser before any
 * distance test runs. A geohash query would replace one round trip with four
 * to nine (Firebase's own guidance says "up to 9 pairs of bounds ... in most
 * cases there are 4"), still require a client-side pass to reject false
 * positives, add a dependency, add a `geohash` field to every document, and
 * need a backfill. It would be worse on every axis at this scale.
 *
 * The upgrade path, written down rather than built: once the corpus passes
 * roughly a thousand postings, `limit(200)` stops being generous and starts
 * being a lie — you would be ranking an arbitrary newest-200 rather than the
 * nearest. THAT is when geohashing earns its keep. Not before.
 *
 * Straight-line, not travel time. A 15-year-old on a bus cares about the
 * latter, but computing it needs a routing API, a key, a quota and a network
 * round trip per result. Straight-line ordering is close enough to rank by and
 * honest about what it is.
 */

/** Mean Earth radius in kilometres, as used by the standard haversine. */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Distance to an opportunity, or null when it has none.
 *
 * `coordinates` is optional on an opportunity and the rules only validate it
 * when present, so a posting without a pin is normal rather than broken. Null
 * means "unknown", and every caller has to decide what that means — which is
 * the point. An opportunity with no pin must never silently vanish because a
 * distance filter is on.
 */
export function distanceToOpportunity(
  from: LatLng | null | undefined,
  coordinates: { lat?: number; lng?: number } | null | undefined,
): number | null {
  if (!from) return null;
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return haversineKm(from, { lat, lng });
}

/** "800 m" reads better than "0.8 km" on a card. */
export function formatDistance(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000 / 50) * 50} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
