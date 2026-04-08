<svelte:options customElement="compass-map-inner" />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { i18n, type Lang } from '../shared/i18n';
  import { Globe as GlobeIcon, Map as MapIcon } from 'lucide-svelte';

  export let apiurl = '';
  export let lang: Lang = 'en';
  export let entities: any[] = [];

  let mapContainer: HTMLElement;
  let map: maplibregl.Map;
  let projection: 'globe' | 'mercator' = 'mercator';

  $: t = i18n[lang] || i18n.en;
  $: if (map && entities) {
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
      updateMarkers();
    });
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  function updateMarkers() {
    if (!map || !map.isStyleLoaded()) return;

    // Remove all layers that depend on 'entities' source before removal
    const layers = ['clusters', 'cluster-count', 'unclustered-point', 'cta-points', 'region-fill', 'region-outline'];
    layers.forEach(l => {
      if (map.getLayer(l)) map.removeLayer(l);
    });

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

    // Regular Points
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'entities',
      filter: ['all', ['!', ['has', 'point_count']], ['!', ['has', 'is_cta']]],
      paint: {
        'circle-color': '#10b981', // Neon Green for high-contrast
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
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
        'circle-radius': 9,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffe4e6',
        'circle-blur': 0.1
      }
    });

    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0].properties.cluster_id;
      // @ts-ignore
      map.getSource('entities').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: (features[0].geometry as any).coordinates,
            zoom: zoom
          });
        }
      );
    });

    map.on('click', ['unclustered-point', 'cta-points'], (e) => {
      const coordinates = (e.features![0].geometry as any).coordinates.slice();
      const props = e.features![0].properties;

      if (props.is_region) return; // Don't show popups for boundaries

      // MapLibre stringifies nested objects — parse them back
      const focusAreas: {iri:string,label:string}[] = (() => { try { return JSON.parse(props.focusAreas || '[]'); } catch { return []; } })();
      const region: {iri:string,label:string}|null = (() => { try { return JSON.parse(props.primaryOceanRegion || 'null'); } catch { return null; } })();
      const funding: {iri:string,label:string}|null = (() => { try { return JSON.parse(props.fundingSource || 'null'); } catch { return null; } })();
      const access: {iri:string,label:string}|null = (() => { try { return JSON.parse(props.accessType || 'null'); } catch { return null; } })();

      const cB = 'display:inline-block;padding:1px 7px;border-radius:100px;font-size:11px;font-weight:500;text-decoration:none;';
      const lS = 'font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;width:68px;flex-shrink:0;padding-top:2px;';
      const rS = 'display:flex;align-items:flex-start;gap:4px;margin:3px 0;';

      function propRow(label: string, inner: string) {
        return `<div style="${rS}"><span style="${lS}">${label}</span><div style="display:flex;flex-wrap:wrap;gap:2px;">${inner}</div></div>`;
      }
      function chipLink(iri: string, lbl: string, bg: string, fg: string) {
        return `<a href="${iri}" target="_blank" rel="noopener noreferrer" style="${cB}background:${bg};color:${fg};">${lbl}</a>`;
      }

      const focusRow = focusAreas.length
        ? propRow(t.propFocusArea, focusAreas.map(fa => chipLink(fa.iri, fa.label, '#dbeafe', '#1d4ed8')).join(''))
        : '';
      const regionRow  = region  ? propRow(t.propRegion,  chipLink(region.iri,  region.label,  '#ccfbf1', '#0f766e')) : '';
      const fundingRow = funding ? propRow(t.propFunding, chipLink(funding.iri, funding.label, '#fef3c7', '#b45309')) : '';
      const accessRow  = access  ? propRow(t.propAccess,  chipLink(access.iri,  access.label,  '#dcfce7', '#15803d')) : '';

      const chipsHtml = (focusRow || regionRow || fundingRow || accessRow)
        ? `<div style="margin:8px 0;border-top:1px solid #f1f5f9;padding-top:6px;">${focusRow}${regionRow}${fundingRow}${accessRow}</div>`
        : '';

      new maplibregl.Popup({ closeButton: false, maxWidth: '300px' })
        .setLngLat(coordinates)
        .setHTML(`
          <div class="popup-content">
            <h4 style="margin: 0 0 4px; font-weight: 700; color: #0f172a;">${props.label}</h4>
            <a href="${props.typeIri}" target="_blank" rel="noopener noreferrer" style="display:inline-block; font-size: 11px; padding: 2px 6px; background: #f1f5f9; border-radius: 4px; color: #475569; margin-bottom: 4px; text-decoration:none;">${props.type}</a>
            ${chipsHtml}
            ${props.founded ? `<p style="margin:4px 0 0; font-size:11px; color:#94a3b8;">Est. ${props.founded}</p>` : ''}
            <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
               <button style="background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer;">${t.details}</button>
            </div>
          </div>
        `)
        .addTo(map);
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

  :global(.maplibregl-popup-content) {
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  }
</style>
