# Telematics Guardian — TODO

## Pending validation

### Traccar geocoding outside the US
Traccar is configured to use Google Maps geocoding (`geocoder.type=google` in `/opt/traccar/conf/traccar.xml`).
This was verified to work accurately in the US (Valley Stream, NY).

**Action required:** Test with a device in Guatemala (or any non-US location). If the address returned by Traccar is inaccurate or missing, fall back to calling Google's Geocoding API directly from the backend at alert-fire time and store the result in `alerts.position.address`.

The reverse geocode function was removed from `src/shared/utils/googlePlaces.js` — restore it if the fallback is needed.
