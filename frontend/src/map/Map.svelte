<svelte:options customElement="compass-map-inner" />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  // Inlined so it can be injected into the shadow root below, which
  // document-level stylesheets never reach.
  import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?inline';
  import { i18n, type Lang } from '../shared/i18n';
  import { Globe as GlobeIcon, Map as MapIcon, BookOpen } from 'lucide-svelte';
  import regionsData from './regions.json';

  // Region boundary polygons keyed by regionKey, built by
  // scripts/build-regions.mjs. Country/Area entities arrive without geometry;
  // their polygon is joined here at render time.
  const REGION_GEOMETRY: Record<string, any> = {};
  for (const f of (regionsData as any).features) {
    REGION_GEOMETRY[f.properties.regionKey] = f.geometry;
  }

  const TYPE_COLORS: Record<string, string> = {
    'http://example.org/ocean-org/ontology#PartnerOrganization': '#10b981', // emerald
    'http://example.org/ocean-org/ontology#Network':             '#06b6d4', // cyan
    'http://example.org/ocean-org/ontology#InternationalForum':  '#f59e0b', // amber
    'http://example.org/ocean-org/ontology#Project':             '#ec4899', // pink
  };
  const DEFAULT_PIN_COLOR = '#64748b'; // slate for unknown types
  const FEATURED_IRI = 'http://example.org/ocean-org/data#OceanCare';

  function getTypeLabel(iri: string, l: Lang): string {
    const key = iri.split('#')[1]?.split('/').pop() ?? iri;
    const labels: Record<string, { en: string; de: string }> = {
      PartnerOrganization: { en: 'Partner Organisation', de: 'Partnerorganisation' },
      Network: { en: 'Network', de: 'Netzwerk' },
      InternationalForum: { en: 'International Forum', de: 'Internationales Forum' },
      Project: { en: 'Project', de: 'Projekt' },
      CountryArea: { en: 'Country / Area', de: 'Land / Gebiet' },
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

  function typeColorExpression(): maplibregl.ExpressionSpecification {
    const expr: any[] = ['match', ['get', 'typeIri']];
    for (const [iri, color] of Object.entries(TYPE_COLORS)) {
      expr.push(iri, color);
    }
    expr.push(DEFAULT_PIN_COLOR);
    return expr as maplibregl.ExpressionSpecification;
  }

  export let lang: Lang = 'en';
  export let entities: any[] = [];
  export let onEntitySelect: (props: any) => void = () => {};
  export let activeTypeFilters: string[] = [];
  export let onTypeFilterChange: (iris: string[]) => void = () => {};
  /** Number of real results (point features) — shared with the panel badge. */
  export let resultCount: number | undefined = undefined;
  /** Whether the entity detail sidebar is open, so the legend can dodge it. */
  export let detailOpen = false;
  /** When a thematic filter is active, include matched regions when framing. */
  export let frameRegions = false;
  /** Story-count CTA, shown as a flat pill by the projection toggle. */
  export let storyCount: { count: number; url: string } | null = null;
  export let storyCountLoading = false;
  /** True when ≥1 thematic tag is active (drives whether the pill shows). */
  export let storyActive = false;

  let mapContainer: HTMLElement;
  let map: maplibregl.Map;
  let projection: 'globe' | 'mercator' = 'mercator';

  // Legend type filter state — empty set means "show all"
  let selectedTypeIris = new Set<string>();

  function toggleTypeLegend(iri: string) {
    if (selectedTypeIris.has(iri)) {
      selectedTypeIris.delete(iri);
    } else {
      selectedTypeIris.add(iri);
    }
    selectedTypeIris = new Set(selectedTypeIris); // trigger reactivity
    onTypeFilterChange([...selectedTypeIris]);
  }

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
    if (activeTypeFilters.length > 0) {
      selectedTypeIris = new Set(activeTypeFilters);
    }

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

  // Extend a bounds object by every coordinate in a GeoJSON geometry
  // (handles Polygon / MultiPolygon nesting via recursion).
  function extendBounds(bounds: maplibregl.LngLatBounds, geometry: any) {
    if (!geometry?.coordinates) return;
    const walk = (arr: any) => {
      if (typeof arr[0] === 'number') bounds.extend(arr as [number, number]);
      else arr.forEach(walk);
    };
    walk(geometry.coordinates);
  }

  function updateMarkers() {
    if (!map || !mapLoaded) return;

    // Remove all layers that depend on 'entities' source before removal
    const layers = ['connections-line', 'connections-nodes', 'clusters', 'cluster-count', 'unclustered-point', 'featured-star', 'region-fill', 'region-outline'];
    layers.forEach(l => {
      if (map.getLayer(l)) map.removeLayer(l);
    });

    if (map.getSource('connections')) map.removeSource('connections');
    if (map.getSource('entities-connections')) map.removeSource('entities-connections');
    if (map.getSource('regions')) map.removeSource('regions');
    if (map.getSource('entities')) {
      map.removeSource('entities');
    }

    // Split incoming features: points (clustered pins) vs. Country/Area regions
    // (shaded polygons). Regions carry no geometry over the wire — join their
    // boundary polygon from the bundled asset by regionKey.
    const pointFeatures = entities.filter(f => f.geometry && f.geometry.type === 'Point');
    const regionFeatures = entities
      .filter(f => f.properties?.is_region)
      .map(f => {
        const geometry = REGION_GEOMETRY[f.properties.regionKey];
        if (!geometry) {
          console.warn('[Compass] no boundary polygon for region', f.properties?.regionKey);
          return null;
        }
        return { ...f, geometry };
      })
      .filter(Boolean);

    // Clustered point source (polygons cannot live in a clustered source)
    map.addSource('entities', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pointFeatures
      },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });

    // Non-clustered region source for shaded Country/Area polygons
    map.addSource('regions', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: regionFeatures
      },
      cluster: false
    });

    // Auto-fit bounds to point features. When a thematic filter is active, also
    // include matched region polygons so the view frames the relevant area
    // (e.g. a single pin inside the Faroe Islands frames the whole region).
    const bounds = new maplibregl.LngLatBounds();
    pointFeatures.forEach(f => bounds.extend(f.geometry.coordinates));
    if (frameRegions) {
      regionFeatures.forEach(f => extendBounds(bounds, f.geometry));
    }
    if (!bounds.isEmpty()) {
      // maxZoom keeps a lone pin, which has zero extent, from snapping to
      // street level while a matched region frames at ~z6-8.
      map.fitBounds(bounds, { padding: 40, maxZoom: 6, duration: 1000 });
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

    // Non-clustered, so connection lines terminate on individual dots rather
    // than off-center on a cluster bubble.
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
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], FEATURED_IRI]],
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

    // Shaded Country/Area polygons (non-clustered)
    map.addLayer({
      id: 'region-fill',
      type: 'fill',
      source: 'regions',
      paint: {
        'fill-color': '#0284c7',
        'fill-opacity': 0.1
      }
    }, 'clusters'); // keep region shading beneath the pins

    map.addLayer({
      id: 'region-outline',
      type: 'line',
      source: 'regions',
      paint: {
        'line-color': '#0284c7',
        'line-width': 2,
        'line-dasharray': [2, 2]
      }
    }, 'clusters');

    buildIndex();
  }

  // relatedProject is [{iri, label}] on the raw features, and a JSON string on
  // features read back off the rendered map.
  function projectIrisOf(raw: any): string[] {
    let list = raw;
    if (typeof raw === 'string') {
      try { list = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(list)) return [];
    return list.map((p: any) => (typeof p === 'string' ? p : p?.iri)).filter(Boolean);
  }

  function buildIndex() {
    coordByIri = new Map();
    orgToProjectIris = new Map();
    projectToOrgIri = new Map();
    for (const feature of entities) {
      if (!feature.geometry?.coordinates) continue;
      const { id: iri, typeIri, relatedProject } = feature.properties;
      if (!iri) continue;
      coordByIri.set(iri, [feature.geometry.coordinates[0], feature.geometry.coordinates[1]]);
      if (typeIri === PROJECT_IRI) continue;
      const pIris = projectIrisOf(relatedProject);
      if (pIris.length) {
        orgToProjectIris.set(iri, pIris);
        for (const pIri of pIris) projectToOrgIri.set(pIri, iri);
      }
    }
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

  const PIN_LAYERS = ['unclustered-point', 'featured-star', 'clusters'];

  function clearSelection() {
    selectedIri = null;
    selectedTypeIri = null;
    clearConnections();
  }

  // Clicking the already-selected pin toggles it closed.
  function selectPin(props: any) {
    if (props.is_region) return;
    if (selectedIri === props.id) {
      clearSelection();
    } else {
      selectedIri = props.id;
      selectedTypeIri = props.typeIri;
      showConnections(selectedIri!, selectedTypeIri!);
    }
    onEntitySelect(props);
  }

  // Hovering previews a pin's connections; leaving falls back to the pinned one.
  function setupPinHandlers(layer: string) {
    map.on('click', layer, (e) => selectPin(e.features![0].properties));
    map.on('mouseenter', layer, (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const props = e.features![0].properties;
      showConnections(props.id, props.typeIri);
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
      if (selectedIri && selectedTypeIri) showConnections(selectedIri, selectedTypeIri);
      else clearConnections();
    });
  }

  function setupEventHandlers() {
    map.on('click', 'clusters', async (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!features.length) return;
      const clusterId = features[0].properties.cluster_id;
      const zoom = await (map.getSource('entities') as any).getClusterExpansionZoom(clusterId);
      map.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
    });
    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });

    setupPinHandlers('unclustered-point');
    setupPinHandlers('featured-star');

    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: [...PIN_LAYERS, 'region-fill'] });
      if (!hit.length && selectedIri) clearSelection();
    });

    // Regions open the detail panel but draw no connection lines. Pins sit on
    // top, so if one is under the cursor let its handler win.
    map.on('click', 'region-fill', (e) => {
      const pinHit = map.queryRenderedFeatures(e.point, { layers: PIN_LAYERS });
      if (pinHit.length) return;
      onEntitySelect(e.features![0].properties);
    });
    map.on('mouseenter', 'region-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'region-fill', () => { map.getCanvas().style.cursor = ''; });
  }

  function toggleProjection() {
    if (!map) return;
    projection = projection === 'mercator' ? 'globe' : 'mercator';
    map.setProjection({ type: projection });
  }
</script>

<div class="map-wrapper">
  {@html `<style>${maplibreCss}</style>`}

  <div bind:this={mapContainer} class="map-container"></div>

  <div class="map-badge">
    {resultCount ?? entities.length} {t.results}
  </div>

  <div class="map-legend" class:shifted={detailOpen}>
    {#each Object.entries(TYPE_COLORS) as [iri, color]}
      <button
        class="legend-item legend-type-btn"
        class:legend-inactive={selectedTypeIris.size > 0 && !selectedTypeIris.has(iri)}
        class:legend-active={selectedTypeIris.has(iri)}
        aria-pressed={selectedTypeIris.has(iri)}
        on:click={() => toggleTypeLegend(iri)}
        title={getTypeLabel(iri, lang)}
      >
        <span class="legend-dot" style="background:{color}"></span>
        <span class="legend-label">{getTypeLabel(iri, lang)}</span>
      </button>
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
    <div class="legend-item">
      <span class="legend-region-swatch"></span>
      <span class="legend-label">{t.legendRegion}</span>
    </div>
  </div>

  <div class="bottom-left-controls">
    <button class="projection-toggle" on:click={toggleProjection}>
      {#if projection === 'mercator'}
        <GlobeIcon size={16} />
        <span>{t.globe}</span>
      {:else}
        <MapIcon size={16} />
        <span>{t.flat}</span>
      {/if}
    </button>

    {#if storyActive}
      {#if storyCountLoading}
        <div class="story-pill story-pill-loading">
          <span class="mini-spinner"></span>
        </div>
      {:else if storyCount !== null && storyCount.count > 0}
        <a href={storyCount.url} target="_blank" rel="noopener noreferrer" class="story-pill">
          <BookOpen size={15} />
          <span><strong>{storyCount.count}</strong> {t.storiesCount}</span>
          <span class="story-arrow">→</span>
        </a>
      {/if}
    {/if}
  </div>
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
  .bottom-left-controls {
    position: absolute;
    bottom: 24px;
    left: 24px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 48px);
  }
  .projection-toggle {
    flex-shrink: 0;
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

  /* Flat stories CTA pill, sits beside the projection toggle */
  .story-pill {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    padding: 8px 14px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 10px;
    color: #1d4ed8;
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    transition: background 0.2s, border-color 0.2s, transform 0.2s;
  }
  .story-pill:hover {
    background: #dbeafe;
    border-color: #93c5fd;
    transform: translateY(-1px);
  }
  .story-pill span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .story-pill strong {
    font-weight: 700;
  }
  .story-arrow {
    flex-shrink: 0;
    font-weight: 700;
  }
  .story-pill-loading {
    cursor: default;
  }
  .mini-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #bfdbfe;
    border-top-color: #1d4ed8;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
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
    transition: right 0.25s ease;
  }
  /* Dodge the 320px detail sidebar so the legend stays visible. */
  .map-legend.shifted {
    right: 336px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .legend-type-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 5px;
    transition: opacity 0.18s, background 0.18s;
    width: 100%;
    text-align: left;
  }
  .legend-type-btn:hover {
    background: rgba(0,0,0,0.06);
  }
  .legend-type-btn.legend-inactive {
    opacity: 0.35;
  }
  .legend-type-btn.legend-active {
    background: rgba(0,0,0,0.07);
  }
  /* Non-color cue: active type label is bold, so state isn't conveyed by
     opacity/background alone. */
  .legend-type-btn.legend-active .legend-label {
    font-weight: 700;
  }
  .legend-type-btn:focus-visible {
    outline: 2px solid #0284c7;
    outline-offset: 1px;
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

  .legend-region-swatch {
    width: 16px;
    height: 11px;
    border-radius: 2px;
    background: rgba(2, 132, 199, 0.1);
    border: 1.5px dashed #0284c7;
    flex-shrink: 0;
    align-self: center;
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
