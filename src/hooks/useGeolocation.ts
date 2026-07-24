import { useState, useEffect } from 'react';

export const NORTH_YORK_BOUNDS = {
  latMin: 43.70,
  latMax: 43.85,
  lngMin: -79.55,
  lngMax: -79.35
};

export function useGeolocation() {
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInsideNorthYork, setIsInsideNorthYork] = useState<boolean | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      setCoords(position.coords);
      const { latitude, longitude } = position.coords;
      
      const inside = 
        latitude >= NORTH_YORK_BOUNDS.latMin && 
        latitude <= NORTH_YORK_BOUNDS.latMax &&
        longitude >= NORTH_YORK_BOUNDS.lngMin &&
        longitude <= NORTH_YORK_BOUNDS.lngMax;
      
      setIsInsideNorthYork(inside);
    };

    const handleError = (error: GeolocationPositionError) => {
      setError(error.message);
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError);
  }, []);

  return { coords, error, isInsideNorthYork };
}
