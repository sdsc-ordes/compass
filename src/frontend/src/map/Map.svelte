<svelte:options customElement="compass-map-inner" />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  // Inlined so it can be injected into the shadow root below, which
  // document-level stylesheets never reach.
  import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?inline';
  import { i18n, type Lang } from '../shared/i18n';
  import { entityTypes } from '../shared/dimensions';
  import { ENTITY_CLASS, FEATURED_IRI } from '../engine/namespaces';
  import type { Feature, Geometry } from '../engine';
  import {
    buildConnectionIndex,
    connectionLines,
    extendBounds,
    graticule,
    parseFeatureProps,
    splitFeatures,
    typeColorExpression,
    type ConnectionIndex,
  } from './geo';
  import { Globe as GlobeIcon, Map as MapIcon, BookOpen } from 'lucide-svelte';
  import regionsData from './regions.json';
  import basemapData from './basemap.json';

  /** The bundled geometry, as the build scripts write it. */
  type GeometryCollection = {
    features: { properties: { regionKey: string }; geometry: Geometry }[];
  };
  type Basemap = Record<'land' | 'borders' | 'lakes' | 'rivers', unknown>;

  // Region boundary polygons keyed by regionKey, built by
  // scripts/build-regions.mjs. Country/Area entities arrive without geometry;
  // their polygon is joined here at render time.
  const REGION_GEOMETRY: Record<string, Geometry> = {};
  for (const f of (regionsData as GeometryCollection).features) {
    REGION_GEOMETRY[f.properties.regionKey] = f.geometry;
  }
  const basemap = basemapData as Basemap;

  // Colour is a presentation choice, so it lives here; the IRIs it is keyed by
  // and the labels the legend shows both come from the ontology.
  const TYPE_COLORS: Record<string, string> = {
    [ENTITY_CLASS.PartnerOrganization]: '#10b981', // emerald
    [ENTITY_CLASS.Network]: '#06b6d4', // cyan
    [ENTITY_CLASS.InternationalForum]: '#f59e0b', // amber
    [ENTITY_CLASS.Project]: '#ec4899', // pink
  };
  const DEFAULT_PIN_COLOR = '#64748b'; // slate for unknown types
  const PIN_COLOR_EXPRESSION = typeColorExpression(
    TYPE_COLORS,
    DEFAULT_PIN_COLOR,
  ) as maplibregl.ExpressionSpecification;

  // The map draws its own background from bundled Natural Earth geometry and
  // tiles we host, so no third-party service is contacted at runtime. Keeping
  // the basemap unlabelled is part of that -- labels would need glyph PBFs
  // from a font server -- and it costs nothing here: every label on the map
  // comes from the ontology, already in both languages.

  // Depth of the pyramid `just map::tiles` renders; the two have to agree, or
  // MapLibre requests tiles that were never written. Past it MapLibre
  // overzooms, which a smooth gradient tolerates well.
  const TILE_MAX_ZOOM = 5;
  const tilePath = () => `${(tileurl ?? '').replace(/\/$/, '')}/tiles/{z}/{x}/{y}.jpg`;

  /** True when tiles are actually being served, so a deployment without them
      falls back to the vector basemap instead of logging a 404 per tile. */
  async function tilesAvailable(): Promise<boolean> {
    try {
      const probe = tilePath().replace('{z}/{x}/{y}', '0/0/0');
      const response = await fetch(probe, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  const OCEAN = '#cfe3f7';
  const OCEAN_DEEP = '#b9d6f2';
  const LAND = '#f6f7f4';
  const LAND_EDGE = '#e8eae4';
  const COASTLINE = '#8fa6bd';
  const BORDER = '#cbd5e1';
  const WATER = '#bcd9f2';
  const GRATICULE = '#a9c6e3';

  function basemapStyle(): maplibregl.StyleSpecification {
    return {
      version: 8,
      sources: {
        land: {
          type: 'geojson',
          data: basemap.land as never,
          // Natural Earth is public domain and asks only for credit; it is the
          // basemap whenever the bathymetry tiles are not served.
          attribution:
            'Basemap: <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a>',
        },
        borders: { type: 'geojson', data: basemap.borders as never },
        lakes: { type: 'geojson', data: basemap.lakes as never },
        rivers: { type: 'geojson', data: basemap.rivers as never },
        graticule: { type: 'geojson', data: graticule() as never },
      },
      layers: [
        { id: 'ocean', type: 'background', paint: { 'background-color': OCEAN_DEEP } },
        {
          id: 'graticule',
          type: 'line',
          source: 'graticule',
          paint: { 'line-color': GRATICULE, 'line-width': 0.5, 'line-opacity': 0.5 },
        },
        // Shallow water where no bathymetry is served: a soft stroke along
        // the coast against a deeper background. The raster layer hides it.
        {
          id: 'shelf',
          type: 'line',
          source: 'land',
          paint: {
            'line-color': OCEAN,
            'line-width': 14,
            'line-blur': 12,
            'line-opacity': 0.9,
          },
        },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': LAND } },
        {
          id: 'land-inner-edge',
          type: 'line',
          source: 'land',
          paint: {
            'line-color': LAND_EDGE,
            'line-width': 5,
            'line-offset': 3,
            'line-blur': 3,
          },
        },
        {
          id: 'borders',
          type: 'line',
          source: 'borders',
          paint: {
            'line-color': BORDER,
            'line-width': 0.6,
            'line-dasharray': [3, 2],
          },
        },
        {
          id: 'rivers',
          type: 'line',
          source: 'rivers',
          paint: {
            'line-color': WATER,
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 1.4],
          },
        },
        { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': WATER } },
        {
          id: 'coastline',
          type: 'line',
          source: 'land',
          paint: { 'line-color': COASTLINE, 'line-width': 0.8 },
        },
      ],
    } as maplibregl.StyleSpecification;
  }

  /** An RGBA bitmap MapLibre can use as a symbol icon, drawn on a canvas. */
  function iconCanvas(size: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    scale: number;
  } {
    const scale = 2; // registered with pixelRatio 2, so it stays crisp
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.scale(scale, scale);
    return { canvas, ctx, scale };
  }

  function toImage(canvas: HTMLCanvasElement): ImageData {
    const ctx = canvas.getContext('2d')!;
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /** The cluster tally, as an icon: a number needs no glyph server this way. */
  function countIcon(count: string): ImageData {
    const size = 32;
    const { canvas, ctx } = iconCanvas(size);
    ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(count, size / 2, size / 2);
    return toImage(canvas);
  }

  /** OceanCare's marker. Drawn as a path, so it needs no font that has U+2605. */
  function starIcon(): ImageData {
    const size = 34;
    const { canvas, ctx } = iconCanvas(size);
    const cx = size / 2;
    const cy = size / 2;
    const outer = 13;
    const inner = outer * 0.42;
    ctx.beginPath();
    for (let point = 0; point < 10; point++) {
      const radius = point % 2 === 0 ? outer : inner;
      const angle = (Math.PI / 5) * point - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    return toImage(canvas);
  }

  export let lang: Lang = 'en';
  /** Origin serving /tiles/; empty means this page's own origin. */
  export let tileurl = '';
  export let entities: Feature[] = [];
  export let onEntitySelect: (props: Record<string, unknown>) => void = () => {};
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

  let connections: ConnectionIndex = { coordByIri: new Map(), neighboursByIri: new Map() };

  // Pinned selection (click-to-persist connections)
  let selectedIri: string | null = null;
  let mapLoaded = false;

  $: t = i18n[lang] || i18n.en;
  // Labels come from the ontology via the filter schema, so the legend needs
  // no translation table of its own.
  $: legendTypes = entityTypes(lang).filter((option) => option.value in TYPE_COLORS);
  $: if (mapLoaded && entities) {
    renderEntities();
  }

  type SourceData = Parameters<maplibregl.GeoJSONSource['setData']>[0];
  const EMPTY = { type: 'FeatureCollection', features: [] } as SourceData;

  onMount(() => {
    if (activeTypeFilters.length > 0) {
      selectedTypeIris = new Set(activeTypeFilters);
    }

    map = new maplibregl.Map({
      container: mapContainer,
      style: basemapStyle(),
      center: [0, 20],
      zoom: 2,
      // Explicit: the data licences require this control, so it must not
      // depend on a MapLibre default. Compact keeps it to an (i) toggle.
      attributionControl: { compact: true },
    });

    // Cluster tallies vary with zoom, so each number's icon is drawn the first
    // time a layer asks for one rather than guessed at up front.
    map.on('styleimagemissing', (e) => {
      const count = /^cluster-count-(\d+)$/.exec(e.id)?.[1];
      if (count && !map.hasImage(e.id)) {
        map.addImage(e.id, countIcon(count), { pixelRatio: 2 });
      }
    });

    map.on('load', async () => {
      map.addImage('featured-star', starIcon(), { pixelRatio: 2 });

      if (await tilesAvailable()) {
        map.addSource('bathymetry', {
          type: 'raster',
          tiles: [tilePath()],
          tileSize: 512,
          maxzoom: TILE_MAX_ZOOM,
          attribution:
            'Imagery reproduced from the GEBCO_2026 Grid, ' +
            '<a href="https://www.gebco.net" target="_blank" rel="noopener">GEBCO</a> ' +
            'Compilation Group. Not to be used for navigation.',
        });
        // Under the land fill and the shelf halo: the real depth data replaces
        // what those approximate, but land stays flat for pin legibility.
        map.addLayer({ id: 'bathymetry', type: 'raster', source: 'bathymetry' }, 'graticule');
        map.setPaintProperty('shelf', 'line-opacity', 0);
      }

      installEntityLayers();
      mapLoaded = true;
      renderEntities();
      setupEventHandlers();
    });
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  /**
   * Add the sources and layers the entity data feeds, once.
   *
   * They are created empty and refilled by setData on every query. Tearing
   * them down and rebuilding them per filter change would drop the style's
   * layer order, re-register the icons and re-run cluster tiling for no gain.
   *
   * Declaration order is render order: regions under the pins, connection
   * lines under the dots they terminate on.
   */
  function installEntityLayers() {
    // Polygons cannot live in a clustered source, so regions get their own.
    map.addSource('regions', { type: 'geojson', data: EMPTY, cluster: false });
    map.addSource('entities', {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });
    map.addSource('connections', { type: 'geojson', data: EMPTY });
    // Non-clustered, so connection lines terminate on individual dots rather
    // than off-center on a cluster bubble.
    map.addSource('entities-connections', { type: 'geojson', data: EMPTY, cluster: false });

    map.addLayer({
      id: 'region-fill',
      type: 'fill',
      source: 'regions',
      paint: { 'fill-color': '#0284c7', 'fill-opacity': 0.1 },
    });
    map.addLayer({
      id: 'region-outline',
      type: 'line',
      source: 'regions',
      paint: { 'line-color': '#0284c7', 'line-width': 2, 'line-dasharray': [2, 2] },
    });

    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'entities',
      filter: ['has', 'point_count'],
      paint: {
        // Dark enough that the white tally drawn over them clears 4.5:1.
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#2563eb',
          10,
          '#1d4ed8',
          50,
          '#1e40af',
        ],
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'entities',
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': ['concat', 'cluster-count-', ['to-string', ['get', 'point_count']]],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    map.addLayer({
      id: 'connections-line',
      type: 'line',
      source: 'connections',
      paint: {
        'line-color': '#6366f1',
        'line-width': 3,
        'line-dasharray': [4, 3],
        'line-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'connections-nodes',
      type: 'circle',
      source: 'entities-connections',
      layout: { visibility: 'none' },
      paint: {
        'circle-color': PIN_COLOR_EXPRESSION,
        'circle-radius': 8,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#6366f1',
      },
    });

    // OceanCare is drawn as a star instead, by the layer below.
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'entities',
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], FEATURED_IRI]],
      paint: {
        'circle-color': PIN_COLOR_EXPRESSION,
        'circle-radius': 12, // 24px diameter — meets WCAG 2.5.8 touch target minimum
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });
    map.addLayer({
      id: 'featured-star',
      type: 'symbol',
      source: 'entities',
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], FEATURED_IRI]],
      layout: {
        'icon-image': 'featured-star',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
  }

  const setData = (id: string, features: unknown[]) =>
    (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    } as SourceData);

  /** Push the current results into the sources and re-frame the view. */
  function renderEntities() {
    if (!map || !mapLoaded) return;

    const { points, regions, unmatchedRegions } = splitFeatures(entities, REGION_GEOMETRY);
    for (const key of unmatchedRegions) {
      console.warn('[Compass] no boundary polygon for region', key);
    }

    setData('entities', points);
    setData('regions', regions);

    connections = buildConnectionIndex(entities);
    const connected = new Set(connections.neighboursByIri.keys());
    setData(
      'entities-connections',
      entities.filter((f) => connected.has(f.properties?.id)),
    );
    // A pin can vanish between queries; without this its lines would persist.
    if (selectedIri && !connections.coordByIri.has(selectedIri)) clearSelection();
    else if (selectedIri) showConnections(selectedIri);

    frameResults(points, regions);
  }

  /**
   * Fit the view to the results.
   *
   * With a thematic filter active the matched regions are included, so a lone
   * pin inside the Faroe Islands frames the whole region rather than the pin.
   */
  function frameResults(points: Feature[], regions: Feature[]) {
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((f) => extendBounds(bounds, f.geometry));
    if (frameRegions) regions.forEach((f) => extendBounds(bounds, f.geometry));
    if (bounds.isEmpty()) return;

    // Filtering re-frames the map on its own; an animation the user did not
    // ask for is what prefers-reduced-motion is there to suppress.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.fitBounds(bounds, {
      // maxZoom keeps a lone pin, which has zero extent, from snapping to
      // street level while a matched region frames at ~z6-8.
      padding: 40,
      maxZoom: 6,
      duration: reduceMotion ? 0 : 1000,
    });
  }

  function showConnections(featureIri: string) {
    const { features, endpointIris } = connectionLines(featureIri, connections);
    setData('connections', features);
    if (endpointIris.length) {
      map.setFilter('connections-nodes', ['in', ['get', 'id'], ['literal', endpointIris]]);
      map.setLayoutProperty('connections-nodes', 'visibility', 'visible');
    } else {
      map.setLayoutProperty('connections-nodes', 'visibility', 'none');
    }
  }

  function clearConnections() {
    setData('connections', []);
    if (map.getLayer('connections-nodes')) {
      map.setLayoutProperty('connections-nodes', 'visibility', 'none');
    }
  }

  const PIN_LAYERS = ['unclustered-point', 'featured-star', 'clusters'];

  // Pins sit on top of region polygons, so an off-centre click would otherwise
  // fall through to the country underneath.
  const PIN_HIT_PADDING = 12;

  type Pin = maplibregl.MapGeoJSONFeature;

  /** A queried pin's position. The GeoJSON geometry union is wider than the
      point layers queried here, so the narrowing is explicit. */
  const pinCoordinates = (f: Pin): [number, number] | null =>
    f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : null;

  function pinsNear(point: maplibregl.Point): Pin[] {
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - PIN_HIT_PADDING, point.y - PIN_HIT_PADDING],
      [point.x + PIN_HIT_PADDING, point.y + PIN_HIT_PADDING],
    ];
    const found = map.queryRenderedFeatures(box, { layers: PIN_LAYERS });
    if (found.length < 2) return found;
    // Nearest to the actual click wins.
    const squaredDistance = (f: Pin) => {
      const coordinates = pinCoordinates(f);
      if (!coordinates) return Infinity; // sorts behind anything with a position
      const projected = map.project(coordinates);
      return (projected.x - point.x) ** 2 + (projected.y - point.y) ** 2;
    };
    return [...found].sort((a, b) => squaredDistance(a) - squaredDistance(b));
  }

  async function expandCluster(feature: Pin) {
    const center = pinCoordinates(feature);
    if (!center) return;
    const zoom = await (
      map.getSource('entities') as maplibregl.GeoJSONSource
    ).getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center, zoom });
  }

  function clearSelection() {
    selectedIri = null;
    clearConnections();
  }

  // Clicking the already-selected pin toggles it closed.
  function selectPin(rawProps: Record<string, unknown>) {
    const props = parseFeatureProps(rawProps);
    if (props.is_region) return;
    if (selectedIri === props.id) {
      clearSelection();
    } else {
      selectedIri = props.id;
      showConnections(props.id);
    }
    onEntitySelect(props);
  }

  // Hovering previews a pin's connections; leaving falls back to the pinned one.
  function setupPinHandlers(layer: string) {
    map.on('mouseenter', layer, (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const id = e.features?.[0]?.properties?.id;
      if (id) showConnections(id);
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
      if (selectedIri) showConnections(selectedIri);
      else clearConnections();
    });
  }

  function setupEventHandlers() {
    map.on('mouseenter', 'clusters', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'clusters', () => {
      map.getCanvas().style.cursor = '';
    });

    setupPinHandlers('unclustered-point');
    setupPinHandlers('featured-star');

    // One handler for the whole map: pins win within PIN_HIT_PADDING, regions
    // only when nothing is near.
    map.on('click', (e) => {
      const [nearest] = pinsNear(e.point);
      if (nearest) {
        if (nearest.layer.id === 'clusters') expandCluster(nearest);
        else selectPin(nearest.properties);
        return;
      }
      const [region] = map.queryRenderedFeatures(e.point, { layers: ['region-fill'] });
      if (region) {
        onEntitySelect(parseFeatureProps(region.properties));
        return;
      }
      if (selectedIri) clearSelection();
    });

    map.on('mouseenter', 'region-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'region-fill', () => {
      map.getCanvas().style.cursor = '';
    });
  }

  function toggleProjection() {
    if (!map) return;
    projection = projection === 'mercator' ? 'globe' : 'mercator';
    map.setProjection({ type: projection });
  }
</script>

<div class="map-wrapper">
  <!-- MapLibre's own stylesheet, imported at build time. The shadow root the
       widget renders into is not reached by document-level styles, so it has
       to be injected here; the content is never runtime input. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html `<style>${maplibreCss}</style>`}

  <!-- role="application" keeps MapLibre's own panning and zooming keys working
       instead of the screen reader intercepting them; the description points at
       the text equivalent App.svelte renders alongside. -->
  <div
    bind:this={mapContainer}
    class="map-container"
    role="application"
    aria-label={t.mapLabel}
    aria-describedby="map-alternative-note"
  ></div>
  <p id="map-alternative-note" class="visually-hidden">{t.mapAlternative}</p>

  <div class="map-badge">
    {resultCount ?? entities.length}
    {t.results}
  </div>

  <div class="map-legend" class:shifted={detailOpen} role="group" aria-label={t.type}>
    {#each legendTypes as { value: iri, label }}
      <button
        class="legend-item legend-type-btn"
        class:legend-inactive={selectedTypeIris.size > 0 && !selectedTypeIris.has(iri)}
        class:legend-active={selectedTypeIris.has(iri)}
        aria-pressed={selectedTypeIris.has(iri)}
        on:click={() => toggleTypeLegend(iri)}
        title={label}
      >
        <span class="legend-dot" style="background:{TYPE_COLORS[iri]}"></span>
        <span class="legend-label">{label}</span>
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
  /* Announced but not shown: the map's description for screen-reader users. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

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
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transition:
      background 0.2s,
      border-color 0.2s,
      transform 0.2s;
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
    to {
      transform: rotate(360deg);
    }
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
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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
    transition:
      opacity 0.18s,
      background 0.18s;
    width: 100%;
    text-align: left;
  }
  .legend-type-btn:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  .legend-type-btn.legend-inactive {
    opacity: 0.35;
  }
  .legend-type-btn.legend-active {
    background: rgba(0, 0, 0, 0.07);
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
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
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
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.1),
      0 8px 10px -6px rgba(0, 0, 0, 0.1);
  }
</style>
