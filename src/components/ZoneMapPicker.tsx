import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons (Vite/Webpack don't ship them by default)
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Props {
  lat: number;
  lng: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
  readOnly?: boolean;
  extraZones?: Array<{ id: string; name: string; latitude: number; longitude: number; radius: number }>;
}

function ClickHandler({ onChange, readOnly }: { onChange: (lat: number, lng: number) => void; readOnly?: boolean }) {
  useMapEvents({
    click(e) {
      if (readOnly) return;
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function ZoneMapPicker({ lat, lng, radius, onChange, height = 320, readOnly, extraZones = [] }: Props) {
  const markerRef = useRef<L.Marker>(null);

  return (
    <div className="rounded-lg overflow-hidden border border-border" style={{ height }}>
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={lat} lng={lng} />
        <ClickHandler onChange={onChange} readOnly={readOnly} />

        {/* Other zones (faded) */}
        {extraZones.map(z => (
          <Circle
            key={z.id}
            center={[z.latitude, z.longitude]}
            radius={z.radius}
            pathOptions={{ color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.08, weight: 1, dashArray: '4 4' }}
          />
        ))}

        {/* Active zone */}
        <Circle
          center={[lat, lng]}
          radius={radius}
          pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.18, weight: 2 }}
        />
        <Marker
          position={[lat, lng]}
          draggable={!readOnly}
          ref={markerRef}
          eventHandlers={{
            dragend: () => {
              const m = markerRef.current;
              if (!m) return;
              const p = m.getLatLng();
              onChange(p.lat, p.lng);
            },
          }}
        />
      </MapContainer>
    </div>
  );
}
