import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, MapPin, Navigation } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';

// Reset standard Leaflet marker icon asset path to avoid bundle resolving issues
const customPinIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-[#1F4C63]/30 rounded-sm animate-ping"></div>
      <div class="w-7 h-7 bg-[#1F4C63] border-2 border-white rounded-sm  flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 21s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 7.2c0 7.3-8 11.8-8 11.8z" />
          <circle cx="12" cy="9" r="2.5" fill="white" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 28],
});

const userLocationIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-[#E08A3C]/40 rounded-sm animate-ping"></div>
      <div class="w-7 h-7 bg-[#E08A3C] border-2 border-white rounded-sm  flex items-center justify-center">
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

interface AddressMapsSelectorProps {
  value: string;
  onChange: (address: string) => void;
  onCoordinatesChange?: (coords: { lat: number; lng: number }) => void;
  initialCoords?: { lat: number; lng: number };
}

// Map Component to dynamically update center
function ChangeMapCenter({ coords }: { coords: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(coords, 14);
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [coords, map]);
  return null;
}

// Map Component to listen for clicks
function MapClickObserver({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AddressMapsSelector({
  value,
  onChange,
  onCoordinatesChange,
  initialCoords,
}: AddressMapsSelectorProps) {
  const { coords: userCoords } = useGeolocation();
  const [coords, setCoords] = useState<[number, number]>([43.7615, -79.4111]); // North York default center
  const [searchQuery, setSearchQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (initialCoords?.lat && initialCoords?.lng) {
      setCoords([initialCoords.lat, initialCoords.lng]);
    }
  }, [initialCoords]);

  useEffect(() => {
    if (value !== undefined && value !== null && value !== searchQuery) {
      setSearchQuery(value);
    }
  }, [value]);

  // Handle Nominatim Address Autocomplete Search
  const fetchSuggestions = async (queryStr: string) => {
    if (!queryStr || queryStr.length < 3) return;
    setIsSearching(true);
    try {
      // Search generally and prioritize landmark names (like CN Tower) by querying directly with GTA viewbox prioritization
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          queryStr
        )}&viewbox=-79.638,43.855,-79.116,43.581&bounded=0&limit=6&addressdetails=1`
      );
      if (resp.ok) {
        const data = await resp.json();
        setSuggestions(data);
        setShowDropdown(true);
      }
    } catch (err) {
      console.error('Error fetching address recommendations:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Implement resilient, debounced effect for query updates
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    // Avoid requesting if the search query is exactly what we just selected to prevent infinite loop
    if (searchQuery === value) return;

    const delayDebounceId = setTimeout(() => {
      fetchSuggestions(searchQuery);
    }, 600);

    return () => clearTimeout(delayDebounceId);
  }, [searchQuery]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    onChange(val); // Pass typed change directly up to form
  };

  // Selection of suggestion
  const selectSuggestion = (item: any) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const addressStr = item.display_name;
    
    setCoords([lat, lng]);
    setSearchQuery(addressStr);
    onChange(addressStr);
    setShowDropdown(false);

    if (onCoordinatesChange) {
      onCoordinatesChange({ lat, lng });
    }
  };

  // Click on the map to reverse geocode
  const handleMapClick = async (lat: number, lng: number) => {
    setCoords([lat, lng]);
    if (onCoordinatesChange) {
      onCoordinatesChange({ lat, lng });
    }

    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.display_name) {
          setSearchQuery(data.display_name);
          onChange(data.display_name);
        }
      }
    } catch (err) {
      console.error('Failed to reverse geocode map coordinates:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar Input */}
      <div className="relative">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
          Organization Address (Search or Tap Pin on Map)
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            className="w-full pr-10 pl-4 py-3 rounded-sm border border-slate-200 text-sm focus:ring-2 focus:ring-[#1F4C63] focus:border-[#1F4C63] bg-white"
            placeholder="Type address, e.g., 5075 Yonge St..."
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
          />
          <span className="absolute right-3 text-slate-600">
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-[#1F4C63]/20 border-t-blue-600 rounded-sm animate-spin"></div>
            ) : (
              <Search className="w-5 h-5" />
            )}
          </span>
        </div>

        {/* Dynamic drop down suggestions */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-60 w-full bg-white mt-1.5 border border-slate-100 rounded-sm  max-h-60 overflow-y-auto divide-y divide-slate-50">
            {suggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="w-full text-left p-3.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors flex items-start gap-2.5 rounded-full"
                onClick={() => selectSuggestion(item)}
              >
                <MapPin className="w-4 h-4 text-[#1F4C63] shrink-0 mt-0.5" />
                <span>{item.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Geolocation Details HUD */}
      <div className="flex flex-wrap gap-4 text-xs font-bold font-mono text-slate-600 bg-slate-50/50 p-4 border border-slate-100 rounded-sm items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-[#1F4C63]" />
          <span>GEO-LOCATION:</span>
        </div>
        <div className="space-x-4">
          <span>LAT: {coords[0].toFixed(5)}</span>
          <span>LNG: {coords[1].toFixed(5)}</span>
        </div>
      </div>

      {/* Embedded Map Visualizer */}
      <div className="w-full h-80 rounded-sm border-2 border-slate-100 overflow-hidden  relative z-10">
        <MapContainer
          center={coords}
          zoom={14}
          scrollWheelZoom={false}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            
            maxZoom={20}
          />
          <Marker position={coords} icon={customPinIcon} />
          {userCoords && (
            <Marker position={[userCoords.latitude, userCoords.longitude]} icon={userLocationIcon}>
              <Popup className="rounded-sm overflow-hidden">
                <div className="p-2 text-center text-xs space-y-1">
                  <div className="font-bold text-slate-900 font-sans">Your Location</div>
                  <div className="text-[10px] text-[#E08A3C] font-mono font-bold uppercase">Active Tracker</div>
                  <div className="text-[10px] text-slate-600 font-mono">Lat: {userCoords.latitude.toFixed(4)}, Lng: {userCoords.longitude.toFixed(4)}</div>
                </div>
              </Popup>
            </Marker>
          )}
          <ChangeMapCenter coords={coords} />
          <MapClickObserver onMapClick={handleMapClick} />
        </MapContainer>
      </div>
    </div>
  );
}
