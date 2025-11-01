const w = typeof window !== 'undefined' ? (window as any) : {};
const env = w.__ENV || (w.__ENV = {});
const defaultMapboxToken = 'pk.eyJ1IjoibG9yZHNvbWJvIiwiYSI6ImNsNWJjOGdoejA2NXQzanNlNGpqb2Y5d3EifQ.YyGLTwRRa6ZqeNK7c93Rig';
const resolvedMapboxToken = env.mapboxToken || w.MAPBOX_TOKEN || w.__MAPBOX_TOKEN__ || defaultMapboxToken;
const resolvedMapStyle = env.mapboxStyle || w.__MAPBOX_STYLE__ || 'mapbox://styles/mapbox/dark-v11';

env.mapboxToken = resolvedMapboxToken;
w.__MAPBOX_TOKEN__ = w.__MAPBOX_TOKEN__ || resolvedMapboxToken;
env.mapboxStyle = resolvedMapStyle;
w.__MAPBOX_STYLE__ = w.__MAPBOX_STYLE__ || resolvedMapStyle;

export const environment = {
  production: false,
  coreApi: w.__CORE_API__ || 'http://localhost:8080',
  cribsApi: w.__CRIBS_API__ || 'http://localhost:8095',
  mapboxToken: resolvedMapboxToken,
  mapStyle: resolvedMapStyle
};
