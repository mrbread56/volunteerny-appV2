import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import type { Opportunity } from '../types';

/**
 * The map half of the browse page, split out so Leaflet is not in everyone's
 * bundle.
 *
 * StudentOpportunities imported `react-leaflet`, `leaflet` and `leaflet.css` at
 * module scope, so every student who opened the browse page downloaded and
 * parsed 154.81 kB of JavaScript and 15.61 kB of CSS (51.79 kB gzipped, about
 * 14% of that page's transfer) before the LIST could render — for a view behind
 * a toggle that defaults to "list" and that many students never open at all.
 * These users are on phones, often on school wifi or mobile data.
 *
 * Nothing here changed except its location: this is the same markup, the same
 * icons, the same tile layer. The parent now reaches it through React.lazy, so
 * the chunk is fetched the first time someone actually switches to map view.
 */

// A custom vector pin rather than Leaflet's default PNG, which 404s under a
// bundler unless its asset paths are rewritten.
const DefaultIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-6 h-6 bg-blue-dark/15 rounded-lg blur-sm"></div>
      <div class="w-8 h-8    border-2 border-white rounded-lg  flex items-center justify-center transition-all duration-300 transform hover:scale-110">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 21C12 21 4 14 4 9C4 5.96 6.46 3.5 9.5 3.5C11.18 3.5 12.69 4.25 13.7 5.43" />
          <path d="M12 21C12 21 20 14 20 9C20 5.96 17.54 3.5 14.5 3.5C12.82 3.5 11.31 4.25 10.3 5.43" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 28],
});
L.Marker.prototype.options.icon = DefaultIcon;

const userLocationIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-amber/40 rounded-lg animate-ping"></div>
      <div class="w-7 h-7 bg-amber border-2 border-white rounded-lg  flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="8" fill="white" fill-opacity="0.2" />
          <circle cx="12" cy="12" r="4" fill="white" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

/**
 * Leaflet measures its container once, on mount. This view mounts inside a tab
 * that was `display: none` a moment earlier, so without a deferred
 * invalidateSize the map renders into a zero-height box and shows grey.
 */
function MapViewManager({ coords }: { coords: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (coords) map.flyTo([coords.lat, coords.lng], 14, { duration: 1.2 });
  }, [coords, map]);

  return null;
}

export default function OpportunitiesMap({
  opportunities,
  userCoords,
  hasLiveGps,
  onOpen,
}: {
  /** Already filtered by the parent; this component only drops the ones with no pin. */
  opportunities: Opportunity[];
  userCoords: { lat: number; lng: number } | null;
  /** Distinguishes a real GPS fix from a neighbourhood fallback, in the popup. */
  hasLiveGps: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <MapContainer
      center={userCoords ? [userCoords.lat, userCoords.lng] : [43.7615, -79.4111]}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
    >
      <MapViewManager coords={userCoords} />

      {userCoords && (
        <Marker position={[userCoords.lat, userCoords.lng]} icon={userLocationIcon}>
          <Popup className="rounded-lg overflow-hidden">
            <div className="p-2 text-center text-xs space-y-1">
              <div className="font-bold text-ink font-sans">Your Location</div>
              <div className="text-xs text-amber-dark font-mono font-bold uppercase tracking-wider">
                {hasLiveGps ? 'Live GPS Tracker' : 'Neighborhood Location'}
              </div>
              <div className="text-xs text-ink-muted font-mono">
                Lat: {userCoords.lat.toFixed(4)}, Lng: {userCoords.lng.toFixed(4)}
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={20}
      />

      {opportunities.filter((o) => o.coordinates).map((opp) => (
        <Marker key={opp.id} position={[opp.coordinates!.lat, opp.coordinates!.lng]} icon={DefaultIcon}>
          <Popup className="custom-popup">
            <div className="p-2 space-y-2">
              <h4 className="font-bold text-ink leading-tight">{opp.title}</h4>
              <Badge variant="secondary" className="text-xs">{opp.category}</Badge>
              <div className="text-xs text-ink-muted flex items-center gap-1">
                <MapPin className="w-3 h-3 text-ink-muted" /> {opp.location}
              </div>
              <Button size="sm" className="w-full mt-2" onClick={() => onOpen(opp.id)}>
                View Details
              </Button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
