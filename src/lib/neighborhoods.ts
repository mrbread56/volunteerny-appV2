import { NEIGHBORHOODS } from '../constants';

/**
 * Where each neighbourhood is, so distance can be measured from a student's
 * stated area rather than from their device.
 *
 * This replaces a ten-branch if/else chain of `lower.includes(...)` tests that
 * was wrong in two ways:
 *
 *   1. It tested `.includes("york")` BEFORE `.includes("north york")`, so
 *      "North York Center" matched the York/Weston branch and every distance
 *      from it was measured from a point about 8 km away.
 *   2. It covered ten spellings against a list of twenty-one. Agincourt,
 *      Downsview, Newtonbrook, High Park / Parkdale, Leslieville / Riverdale
 *      and the three Etobicoke entries all fell through to the North York
 *      default, silently.
 *
 * A lookup keyed on the exact strings in NEIGHBORHOODS cannot have either
 * problem: there is no ordering, and a missing key is a compile-time hole
 * rather than a silent fallback. The test in tests/neighborhoods.spec.ts
 * asserts every value in NEIGHBORHOODS has an entry here.
 *
 * Coordinates are the approximate centre of each area. They are used only to
 * rank and filter by rough distance, never shown as a location.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** North York civic centre. Used for "Other" and for an unrecognised value. */
export const DEFAULT_CENTRE: LatLng = { lat: 43.7615, lng: -79.4111 };

export const NEIGHBORHOOD_COORDS: Record<string, LatLng> = {
  'Agincourt': { lat: 43.7854, lng: -79.2785 },
  'Bayview Village': { lat: 43.7690, lng: -79.3860 },
  'Beaches / East York': { lat: 43.6764, lng: -79.2930 },
  'Central Toronto / Midtown': { lat: 43.7043, lng: -79.3985 },
  'Don Mills': { lat: 43.7749, lng: -79.3450 },
  'Downtown Toronto': { lat: 43.6532, lng: -79.3832 },
  'Downsview': { lat: 43.7398, lng: -79.4830 },
  'Etobicoke Center': { lat: 43.6435, lng: -79.5657 },
  'Etobicoke North': { lat: 43.7185, lng: -79.5760 },
  'Etobicoke South': { lat: 43.6205, lng: -79.5132 },
  'High Park / Parkdale': { lat: 43.6465, lng: -79.4520 },
  'Leslieville / Riverdale': { lat: 43.6640, lng: -79.3350 },
  'Newtonbrook': { lat: 43.7940, lng: -79.4180 },
  'North York Center': { lat: 43.7683, lng: -79.4130 },
  'Scarborough Center': { lat: 43.7731, lng: -79.2578 },
  'Scarborough North': { lat: 43.8090, lng: -79.2500 },
  'Scarborough South': { lat: 43.7100, lng: -79.2400 },
  'Willowdale': { lat: 43.7712, lng: -79.4090 },
  'York / Weston': { lat: 43.6954, lng: -79.4503 },
  'York Mills': { lat: 43.7440, lng: -79.4060 },
  'Other': DEFAULT_CENTRE,
};

/**
 * The centre of a student's stated neighbourhood.
 *
 * Falls back to the North York centre for an unknown or empty value, which is
 * the right behaviour for a ranking signal: an unrecognised neighbourhood
 * should make results slightly less well ordered, never make them disappear.
 */
export function coordsForNeighborhood(name: string | undefined | null): LatLng {
  if (!name) return DEFAULT_CENTRE;
  return NEIGHBORHOOD_COORDS[name] ?? DEFAULT_CENTRE;
}

/** Every neighbourhood offered in the UI has coordinates. Asserted in tests. */
export function missingNeighborhoodCoords(): string[] {
  return NEIGHBORHOODS.filter((n) => !NEIGHBORHOOD_COORDS[n]);
}
