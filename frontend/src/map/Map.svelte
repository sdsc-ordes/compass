<svelte:options customElement="compass-map-inner" />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { i18n, type Lang } from '../shared/i18n';
  import { Globe as GlobeIcon, Map as MapIcon } from 'lucide-svelte';

  // Map entity type IRIs to distinct pin colors
  const TYPE_COLORS: Record<string, string> = {
    'http://example.org/ocean-org/ontology#ResearchInstitute': '#10b981', // emerald
    'http://example.org/ocean-org/ontology#University':        '#3b82f6', // blue
    'http://example.org/ocean-org/ontology#GovernmentAgency':  '#f97316', // orange
    'http://example.org/ocean-org/ontology#NGO':               '#a855f7', // purple
    'http://example.org/ocean-org/ontology#Network':           '#06b6d4', // cyan
    'http://example.org/ocean-org/ontology#InternationalForum':'#f59e0b', // amber
    'http://example.org/ocean-org/ontology#Project':           '#ec4899', // pink
  };
  const DEFAULT_PIN_COLOR = '#64748b'; // slate for unknown types
  const FEATURED_IRI = 'http://example.org/ocean-org/data#OceanCare';

  function getTypeLabel(iri: string, l: Lang): string {
    const key = iri.split('#')[1]?.split('/').pop() ?? iri;
    const labels: Record<string, { en: string; de: string }> = {
      ResearchInstitute: { en: 'Research Institute', de: 'Forschungsinstitut' },
      University: { en: 'University', de: 'Universität' },
      GovernmentAgency: { en: 'Government Agency', de: 'Behörde' },
      NGO: { en: 'NGO', de: 'NGO' },
      Network: { en: 'Network', de: 'Netzwerk' },
      InternationalForum: { en: 'International Forum', de: 'Internationales Forum' },
      Project: { en: 'Project', de: 'Projekt' },
    };
    const found = labels[key];
    if (!found) return key.replace(/([A-Z])/g, ' $1').trim();
    return l === 'de' ? found.de : found.en;
  }

  function containsNameField(expr: any): boolean {
    if (!expr) return false;
    if (typeof expr === 'string') return expr.includes('name');
    if (Array.isArray(expr)) return expr.some(containsNameField);
    if (typeof expr === 'object') return Object.values(expr).some(containsNameField);
    return false;
  }

  function applyBasemapLanguage(l: Lang) {
    if (!map?.isStyleLoaded()) return;
    const layers = map.getStyle().layers || [];
    const field = l === 'de'
      ? ['coalesce', ['get', 'name:de'], ['get', 'name'], ['get', 'name:en']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name'], ['get', 'name:de']];

    for (const layer of layers) {
      if (layer.type !== 'symbol') continue;
      const current = map.getLayoutProperty(layer.id, 'text-field');
      if (!containsNameField(current)) continue;
      try {
        map.setLayoutProperty(layer.id, 'text-field', field as any);
      } catch {
        // Some symbol layers may not accept dynamic text-field overrides.
      }
    }
  }

  // Build a MapLibre match expression from the type color map
  function typeColorExpression(): maplibregl.ExpressionSpecification {
    const expr: any[] = ['match', ['get', 'typeIri']];
    for (const [iri, color] of Object.entries(TYPE_COLORS)) {
      expr.push(iri, color);
    }
    expr.push(DEFAULT_PIN_COLOR); // fallback
    return expr as maplibregl.ExpressionSpecification;
  }

  export let apiurl = '';
  export let lang: Lang = 'en';
  export let entities: any[] = [];
  export let onEntitySelect: (props: any) => void = () => {};

  /** Expose the WebGL canvas for screenshot capture. */
  export function getMapCanvas(): HTMLCanvasElement | null {
    return map?.getCanvas() ?? null;
  }

  let mapContainer: HTMLElement;
  let map: maplibregl.Map;
  let projection: 'globe' | 'mercator' = 'mercator';

  // Hover/click connection index
  const PROJECT_IRI = 'http://example.org/ocean-org/ontology#Project';
  let coordByIri = new Map<string, [number, number]>();
  let orgToProjectIris = new Map<string, string[]>();
  let projectToOrgIri = new Map<string, string>();

  // Pinned selection (click-to-persist connections)
  let selectedIri: string | null = null;
  let selectedTypeIri: string | null = null;
  let mapLoaded = false;

  $: t = i18n[lang] || i18n.en;
  $: if (mapLoaded) {
    applyBasemapLanguage(lang);
  }
  $: if (mapLoaded && entities) {
    updateMarkers();
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [0, 20],
      zoom: 2,
    });

    map.on('load', () => {
      try {
        addOceanLayers();
      } catch (e) {
        console.warn('[Compass] Ocean layers failed to initialize:', e);
      }
      // Enable canvas buffer preservation for screenshot export
      const canvas = map.getCanvas();
      if (canvas) {
        (canvas as any).getContext('webgl', { preserveDrawingBuffer: true });
      }
      mapLoaded = true;
      applyBasemapLanguage(lang);
      updateMarkers();
      setupEventHandlers();
    });
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  function addOceanLayers() {
    // Find the first layer above 'water' so we can insert ocean overlays
    // between the basemap water fill (blue) and land/label layers.
    const styleLayers = map.getStyle().layers;
    const waterIdx = styleLayers.findIndex(l => l.id === 'water');
    const aboveWater = waterIdx >= 0 && waterIdx + 1 < styleLayers.length
      ? styleLayers[waterIdx + 1].id
      : undefined;

    // --- GEBCO Bathymetry ---
    // Free for commercial use with attribution: https://www.gebco.net/data_and_products/gridded_bathymetry_data/
    map.addSource('gebco-bathymetry', {
      type: 'raster',
      tiles: [
        'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
        '&LAYERS=GEBCO_LATEST&WIDTH=256&HEIGHT=256&CRS=EPSG:3857' +
        '&BBOX={bbox-epsg-3857}&FORMAT=image/png'
      ],
      tileSize: 256,
      attribution: '© <a href="https://www.gebco.net" target="_blank" rel="noopener">GEBCO</a> Compilation Group'
    });

    // GEBCO sits ABOVE the basemap water fill at partial opacity.
    // The basemap keeps its natural blue ocean color; GEBCO adds depth texture on top.
    // Land/label layers above mask GEBCO on land automatically.
    map.addLayer(
      { id: 'gebco-layer', type: 'raster', source: 'gebco-bathymetry',
        paint: {
          'raster-opacity': 0.35,
          'raster-contrast': 0.15,
          'raster-saturation': -0.3,
        }
      },
      aboveWater
    );

    // --- OpenSeaMap nautical overlay ---
    // Free for commercial use (CC BY-SA 2.0): https://www.openseamap.org
    map.addSource('openseamap', {
      type: 'raster',
      tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openseamap.org" target="_blank" rel="noopener">OpenSeaMap</a> contributors'
    });

    // Subtle nautical marks above bathymetry, below entity pins
    map.addLayer({
      id: 'openseamap-layer',
      type: 'raster',
      source: 'openseamap',
      paint: { 'raster-opacity': 0.45 }
    });
  }

  function updateMarkers() {
    if (!map || !mapLoaded) return;

    // Remove all layers that depend on 'entities' source before removal
    const layers = ['connections-line', 'connections-nodes', 'clusters', 'cluster-count', 'unclustered-point', 'featured-star', 'cta-points', 'region-fill', 'region-outline'];
    layers.forEach(l => {
      if (map.getLayer(l)) map.removeLayer(l);
    });

    if (map.getSource('connections')) map.removeSource('connections');
    if (map.getSource('entities-connections')) map.removeSource('entities-connections');
    if (map.getSource('entities')) {
      map.removeSource('entities');
    }

    map.addSource('entities', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: entities
      },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });

    // Auto-fit bounds if we have features
    if (entities && entities.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      entities.forEach(f => {
        if (f.geometry && f.geometry.type === 'Point') {
          bounds.extend(f.geometry.coordinates);
        }
      });
      map.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 1000 });
    }

    // Color-coded clusters
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'entities',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#60a5fa',
          10,
          '#3b82f6',
          50,
          '#2563eb'
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          16,
          10,
          22,
          50,
          28
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });

    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'entities',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count}',
        'text-font': ['Noto Sans Regular'],
        'text-size': 12
      },
      paint: {
        'text-color': '#fff'
      }
    });

    // Connections source + layer added BEFORE point layers so dots appear on top
    map.addSource('connections', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
      id: 'connections-line',
      type: 'line',
      source: 'connections',
      paint: {
        'line-color': '#6366f1',
        'line-width': 3,
        'line-dasharray': [4, 3],
        'line-opacity': 0.9
      }
    });

    // Separate non-clustered source for connection endpoint nodes.
    // This ensures lines always terminate on precisely-placed individual dots
    // instead of off-center on a cluster bubble.
    map.addSource('entities-connections', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: false
    });
    map.addLayer({
      id: 'connections-nodes',
      type: 'circle',
      source: 'entities-connections',
      layout: { visibility: 'none' },
      paint: {
        'circle-color': typeColorExpression(),
        'circle-radius': 8,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#6366f1'
      }
    });

    // Regular Points — color-coded by entity type (OceanCare rendered separately as a star)
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'entities',
      filter: ['all', ['!', ['has', 'point_count']], ['!', ['has', 'is_cta']], ['!=', ['get', 'id'], FEATURED_IRI]],
      paint: {
        'circle-color': typeColorExpression(),
        'circle-radius': 12, // 24px diameter — meets WCAG 2.5.8 touch target minimum
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });

    // OceanCare — gold star symbol
    map.addLayer({
      id: 'featured-star',
      type: 'symbol',
      source: 'entities',
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], FEATURED_IRI]],
      layout: {
        'text-field': '★',
        'text-size': 28,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#f59e0b',
        'text-halo-color': '#fff',
        'text-halo-width': 1.5,
      }
    });

    // CTA Points (Neon/Action)
    map.addLayer({
      id: 'cta-points',
      type: 'circle',
      source: 'entities',
      filter: ['all', ['!', ['has', 'point_count']], ['has', 'is_cta']],
      paint: {
        'circle-color': '#f43f5e',
        'circle-radius': 12, // 24px diameter — meets WCAG 2.5.8 touch target minimum
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffe4e6',
        'circle-blur': 0.1
      }
    });

    // Region Highlighting Layers
    map.addLayer({
      id: 'region-fill',
      type: 'fill',
      source: 'entities',
      filter: ['all', ['has', 'is_region']],
      paint: {
        'fill-color': '#0284c7',
        'fill-opacity': 0.1
      }
    });

    map.addLayer({
      id: 'region-outline',
      type: 'line',
      source: 'entities',
      filter: ['all', ['has', 'is_region']],
      paint: {
        'line-color': '#0284c7',
        'line-width': 2,
        'line-dasharray': [2, 2]
      }
    });

    // Build hover connection index from current entities
    buildIndex();
  }

  function buildIndex() {
    coordByIri = new Map();
    orgToProjectIris = new Map();
    projectToOrgIri = new Map();
    for (const feature of entities) {
      if (!feature.geometry?.coordinates) continue;
      const { id: iri, typeIri, projectIris: rawProjectIris } = feature.properties;
      if (!iri) continue;
      const coords: [number, number] = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
      coordByIri.set(iri, coords);
      if (typeIri !== PROJECT_IRI) {
        // projectIris is an array on the raw feature, JSON string when stringified
        let pIris: string[] = [];
        try {
          pIris = Array.isArray(rawProjectIris)
            ? rawProjectIris
            : rawProjectIris ? JSON.parse(rawProjectIris) : [];
        } catch { /* ignore */ }
        if (pIris.length) {
          orgToProjectIris.set(iri, pIris);
          for (const pIri of pIris) projectToOrgIri.set(pIri, iri);
        }
      }
    }
    console.log('[Compass] Connection index built —',
      'orgs with projects:', orgToProjectIris.size,
      'project→org entries:', projectToOrgIri.size,
      'total coords:', coordByIri.size);
    updateConnectionsSource();
  }

  function updateConnectionsSource() {
    const src = map.getSource('entities-connections') as any;
    if (!src) return;
    // Collect all features that participate in at least one connection
    const connectedIris = new Set<string>([
      ...orgToProjectIris.keys(),
      ...projectToOrgIri.keys()
    ]);
    const features = entities.filter(f => connectedIris.has(f.properties?.id));
    src.setData({ type: 'FeatureCollection', features });
  }

  function showConnections(featureIri: string, typeIri: string) {
    const src = map.getSource('connections') as any;
    if (!src) { console.warn('[Compass] connections source not found'); return; }
    const srcCoords = coordByIri.get(featureIri);
    if (!srcCoords) { console.warn('[Compass] no coords for', featureIri); return; }
    const lines: any[] = [];
    if (typeIri === PROJECT_IRI) {
      const orgIri = projectToOrgIri.get(featureIri);
      if (orgIri) {
        const orgCoords = coordByIri.get(orgIri);
        if (orgCoords) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [srcCoords, orgCoords] }, properties: {} });
      }
    } else {
      for (const pIri of orgToProjectIris.get(featureIri) ?? []) {
        const pCoords = coordByIri.get(pIri);
        if (pCoords) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [srcCoords, pCoords] }, properties: {} });
      }
    }
    console.log('[Compass] showConnections', featureIri, '→', lines.length, 'line(s)');
    src.setData({ type: 'FeatureCollection', features: lines });

    // Show the connection endpoint nodes from the non-clustered source so
    // lines terminate on individual dots rather than cluster bubbles.
    let endpointIris: string[] = [];
    if (typeIri === PROJECT_IRI) {
      const orgIri = projectToOrgIri.get(featureIri);
      if (orgIri) endpointIris = [orgIri];
    } else {
      endpointIris = orgToProjectIris.get(featureIri) ?? [];
    }
    if (endpointIris.length) {
      map.setFilter('connections-nodes', ['in', ['get', 'id'], ['literal', endpointIris]]);
      map.setLayoutProperty('connections-nodes', 'visibility', 'visible');
    }
  }

  function clearConnections() {
    const src = map.getSource('connections') as any;
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    if (map.getLayer('connections-nodes')) {
      map.setLayoutProperty('connections-nodes', 'visibility', 'none');
    }
  }

  function setupEventHandlers() {
    map.on('click', 'clusters', async (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!features.length) return;
      const clusterId = features[0].properties.cluster_id;
      const zoom = await (map.getSource('entities') as any).getClusterExpansionZoom(clusterId);
      map.easeTo({
        center: (features[0].geometry as any).coordinates,
        zoom
      });
    });

    map.on('click', 'unclustered-point', (e) => {
      const props = e.features![0].properties;
      if (props.is_region) return;
      if (selectedIri === props.id) {
        // Second click on the same node — deselect
        selectedIri = null;
        selectedTypeIri = null;
        clearConnections();
      } else {
        selectedIri = props.id;
        selectedTypeIri = props.typeIri;
        showConnections(selectedIri, selectedTypeIri!);
      }
      onEntitySelect(props);
    });

    map.on('click', 'cta-points', (e) => {
      const props = e.features![0].properties;
      if (props.is_region) return;
      if (selectedIri === props.id) {
        selectedIri = null;
        selectedTypeIri = null;
        clearConnections();
      } else {
        selectedIri = props.id;
        selectedTypeIri = props.typeIri;
        showConnections(selectedIri, selectedTypeIri!);
      }
      onEntitySelect(props);
    });

    // Click on empty map — clear selection
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point', 'featured-star', 'cta-points', 'clusters'] });
      if (!hit.length && selectedIri) {
        selectedIri = null;
        selectedTypeIri = null;
        clearConnections();
      }
    });

    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'featured-star', (e) => {
      const props = e.features![0].properties;
      if (selectedIri === props.id) {
        selectedIri = null;
        selectedTypeIri = null;
        clearConnections();
      } else {
        selectedIri = props.id;
        selectedTypeIri = props.typeIri;
        showConnections(selectedIri, selectedTypeIri!);
      }
      onEntitySelect(props);
    });
    map.on('mouseenter', 'featured-star', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const props = e.features![0].properties;
      showConnections(props.id, props.typeIri);
    });
    map.on('mouseleave', 'featured-star', () => {
      map.getCanvas().style.cursor = '';
      if (selectedIri && selectedTypeIri) {
        showConnections(selectedIri, selectedTypeIri);
      } else {
        clearConnections();
      }
    });
    map.on('mouseenter', 'unclustered-point', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const props = e.features![0].properties;
      showConnections(props.id, props.typeIri);
    });
    map.on('mouseleave', 'unclustered-point', () => {
      map.getCanvas().style.cursor = '';
      // Restore pinned selection if one is active
      if (selectedIri && selectedTypeIri) {
        showConnections(selectedIri, selectedTypeIri);
      } else {
        clearConnections();
      }
    });
    map.on('mouseenter', 'cta-points', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const props = e.features![0].properties;
      showConnections(props.id, props.typeIri);
    });
    map.on('mouseleave', 'cta-points', () => {
      map.getCanvas().style.cursor = '';
      if (selectedIri && selectedTypeIri) {
        showConnections(selectedIri, selectedTypeIri);
      } else {
        clearConnections();
      }
    });
  }

  function toggleProjection() {
    if (!map) return;
    projection = projection === 'mercator' ? 'globe' : 'mercator';
    map.setProjection({ type: projection });
  }
</script>

<div class="map-wrapper">
  <!-- Inject MapLibre CSS directly into Shadow DOM for reliability (v5) -->
  <link rel='stylesheet' href='https://unpkg.com/maplibre-gl@5.0.0/dist/maplibre-gl.css' />
  
  <div bind:this={mapContainer} class="map-container"></div>
  
  <div class="map-badge">
    {entities.length} {t.results}
  </div>

  <div class="map-legend">
    {#each Object.entries(TYPE_COLORS) as [iri, color]}
      <div class="legend-item">
        <span class="legend-dot" style="background:{color}"></span>
        <span class="legend-label">{getTypeLabel(iri, lang)}</span>
      </div>
    {/each}
    <div class="legend-separator"></div>
    <div class="legend-item">
      <span style="color:#f59e0b; font-size:1.1rem; line-height:1; flex-shrink:0;">★</span>
      <span class="legend-label">OceanCare</span>
    </div>
    <div class="legend-separator"></div>
    <div class="legend-item">
      <span class="legend-dash"></span>
      <span class="legend-label">{t.orgProjectLink}</span>
    </div>
  </div>

  <button class="projection-toggle" on:click={toggleProjection}>
    {#if projection === 'mercator'}
      <GlobeIcon size={16} />
      <span>{t.globe}</span>
    {:else}
      <MapIcon size={16} />
      <span>{t.flat}</span>
    {/if}
  </button>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .map-container {
    width: 100%;
    height: 100%;
  }
  .projection-toggle {
    position: absolute;
    bottom: 24px;
    left: 24px;
    z-index: 10;
    padding: 8px 14px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    color: #1e293b;
    transition: all 0.2s;
  }
  .projection-toggle:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    transform: translateY(-1px);
  }

  .map-badge {
    position: absolute;
    top: 24px;
    left: 24px;
    z-index: 10;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(4px);
    color: white;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .map-legend {
    position: absolute;
    bottom: 70px;
    right: 16px;
    z-index: 10;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(4px);
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.15);
    flex-shrink: 0;
  }

  .legend-label {
    font-size: 0.72rem;
    font-weight: 500;
    color: #1e293b;
    white-space: nowrap;
  }

  .legend-separator {
    height: 1px;
    background: #e2e8f0;
    margin: 3px 0;
  }

  .legend-dash {
    width: 18px;
    height: 2px;
    background: repeating-linear-gradient(
      to right,
      #6366f1 0px,
      #6366f1 5px,
      transparent 5px,
      transparent 9px
    );
    flex-shrink: 0;
    align-self: center;
  }

  :global(.maplibregl-popup-content) {
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  }
</style>
