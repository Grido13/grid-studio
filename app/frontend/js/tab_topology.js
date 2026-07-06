/* Tab 3 — Topology with filters. Buses + lines + transformers + links, color by voltage. */

const TabTopology = (() => {
  let layers = { buses: null, lines: null, trafos: null, links: null, plants: null };
  let data = null;
  let mapRef = null;
  let state = { v_nom: [110, 220, 380], country: 'DE', searchBus: '',
                degMin: 0, degMax: 99, includeGeom: false };

  const SIDEBAR_HTML = () => `
    <h2>Topology</h2>
    <div class="muted">Real OSM line geometry when "Use real geometry" is on (slower).</div>

    <h3>Voltage</h3>
    <div>
      <label class="checkbox-row"><input type="checkbox" data-v="380" ${state.v_nom.includes(380) ? 'checked' : ''}>
        <span class="legend-color" style="display:inline-block;background:${App.VOLTAGE_COLORS[380]}"></span> 380 kV</label>
      <label class="checkbox-row"><input type="checkbox" data-v="220" ${state.v_nom.includes(220) ? 'checked' : ''}>
        <span class="legend-color" style="display:inline-block;background:${App.VOLTAGE_COLORS[220]}"></span> 220 kV</label>
      <label class="checkbox-row"><input type="checkbox" data-v="110" ${state.v_nom.includes(110) ? 'checked' : ''}>
        <span class="legend-color" style="display:inline-block;background:${App.VOLTAGE_COLORS[110]}"></span> 110 kV</label>
    </div>

    <h3>Country</h3>
    <div class="field">
      <select id="t-country">
        <option value="DE" ${state.country === 'DE' ? 'selected' : ''}>Germany</option>
        <option value="" ${state.country === '' ? 'selected' : ''}>All (incl. neighbors)</option>
      </select>
    </div>

    <h3>Bus search</h3>
    <div class="field">
      <input type="text" id="bus-search" placeholder="bus_id" value="${state.searchBus}">
    </div>

    <h3>Node degree</h3>
    <div class="field" style="display: flex; gap: 6px">
      <input type="number" id="deg-min" min="0" placeholder="min" value="${state.degMin}" style="width:50%">
      <input type="number" id="deg-max" min="0" placeholder="max" value="${state.degMax}" style="width:50%">
    </div>

    <h3>Geometry</h3>
    <label class="checkbox-row"><input type="checkbox" id="include-geom" ${state.includeGeom ? 'checked' : ''}> Use real OSM geometry (slower)</label>

    <button class="btn" id="apply" style="margin-top:8px">Reload</button>

    <div id="t-summary" class="summary-box" style="margin-top: 12px"></div>

    <h3>Legend</h3>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:${App.VOLTAGE_COLORS[380]}"></div> 380 kV bus</div>
      <div class="legend-item"><div class="legend-dot" style="background:${App.VOLTAGE_COLORS[220]}"></div> 220 kV bus</div>
      <div class="legend-item"><div class="legend-dot" style="background:${App.VOLTAGE_COLORS[110]}"></div> 110 kV bus</div>
      <div class="legend-item"><div class="legend-color" style="background:${App.VOLTAGE_COLORS[380]}"></div> 380 kV line</div>
      <div class="legend-item"><div class="legend-color" style="background:${App.VOLTAGE_COLORS[220]}"></div> 220 kV line</div>
      <div class="legend-item"><div class="legend-color" style="background:${App.VOLTAGE_COLORS[110]}"></div> 110 kV line</div>
      <div class="legend-item"><div class="legend-color" style="background:#FF9800;border-top:1px dashed #fff"></div> Transformer</div>
      <div class="legend-item"><div class="legend-color" style="background:#00e5ff;border-top:1px dashed #fff"></div> HVDC link</div>
    </div>
  `;

  async function activate(map) {
    mapRef = map;
    App.setSidebar(SIDEBAR_HTML());
    document.getElementById('apply').onclick = () => reload(map);
    await reload(map);
  }

  function deactivate(map) {
    Object.values(layers).forEach(l => { if (l) map.removeLayer(l); });
    layers = { buses: null, lines: null, trafos: null, links: null, plants: null };
  }

  async function reload(map) {
    state.v_nom = Array.from(document.querySelectorAll('#sidebar input[data-v]:checked'))
                        .map(el => parseFloat(el.dataset.v));
    state.country = document.getElementById('t-country').value;
    state.searchBus = document.getElementById('bus-search').value.trim();
    state.degMin = parseInt(document.getElementById('deg-min').value) || 0;
    state.degMax = parseInt(document.getElementById('deg-max').value) || 99;
    state.includeGeom = document.getElementById('include-geom').checked;

    const params = new URLSearchParams();
    if (state.v_nom.length > 0) params.set('v_nom', state.v_nom.join(','));
    if (state.country) params.set('country', state.country);
    params.set('include_geom', state.includeGeom);

    document.getElementById('t-summary').innerHTML = '<div class="muted"><span class="spinner"></span>Loading…</div>';
    data = await App.api('/api/topology?' + params.toString());

    // Build degree map
    const degree = {};
    data.lines.forEach(l => { degree[l.bus0] = (degree[l.bus0] || 0) + 1; degree[l.bus1] = (degree[l.bus1] || 0) + 1; });
    data.transformers.forEach(t => { degree[t.bus0] = (degree[t.bus0] || 0) + 1; degree[t.bus1] = (degree[t.bus1] || 0) + 1; });

    render(map, degree);
  }

  function render(map, degree) {
    Object.values(layers).forEach(l => { if (l) map.removeLayer(l); });

    // Bus filter (degree + search)
    const busOK = b => {
      const d = degree[b.bus_id] || 0;
      if (d < state.degMin || d > state.degMax) return false;
      if (state.searchBus && String(b.bus_id) !== state.searchBus) return false;
      return true;
    };

    const busFeatures = data.buses.filter(busOK).map(b => {
      const m = L.circleMarker([b.lat, b.lon], {
        radius: b.v_nom >= 380 ? 4.5 : (b.v_nom >= 220 ? 3.5 : 2.5),
        fillColor: App.colorForVoltage(b.v_nom),
        color: '#000', weight: 0.5, fillOpacity: 0.85,
      });
      m.bindTooltip(`<b>Bus ${b.bus_id}</b> · ${b.v_nom} kV<br>Country: ${b.country}<br>Degree: ${degree[b.bus_id] || 0}`);
      m.on('click', () => showBusDetail(b.bus_id));
      return m;
    });
    layers.buses = L.layerGroup(busFeatures).addTo(map);

    // Lines (with parallel offset)
    const validBusIds = new Set(data.buses.filter(busOK).map(b => b.bus_id));
    const busCoord = {};
    data.buses.forEach(b => busCoord[b.bus_id] = [b.lat, b.lon]);

    const lineFeatures = data.lines
      .filter(l => validBusIds.has(l.bus0) && validBusIds.has(l.bus1))
      .map(l => {
        let coords;
        if (l.geom && l.geom.coordinates) {
          // OSM line geometry: GeoJSON LineString or MultiLineString
          if (l.geom.type === 'LineString') {
            coords = l.geom.coordinates.map(c => [c[1], c[0]]);
          } else {
            coords = l.geom.coordinates.flat().map(c => [c[1], c[0]]);
          }
        } else {
          coords = [busCoord[l.bus0], busCoord[l.bus1]];
        }
        if (l.parallel_count > 1 && coords.length === 2) {
          const off = (l.parallel_index - (l.parallel_count - 1) / 2) * 0.004;
          coords = offsetCoords(coords[0], coords[1], off);
        }
        const polyline = L.polyline(coords, {
          color: App.colorForVoltage(l.v_nom),
          weight: l.v_nom >= 380 ? 2 : (l.v_nom >= 220 ? 1.5 : 0.8),
          opacity: 0.85,
        });
        polyline.bindTooltip(
          `<b>Line ${l.line_id}</b> · ${l.v_nom} kV<br>` +
          `s_nom: ${l.s_nom?.toFixed?.(0) || '?'} MW<br>` +
          `length: ${l.length?.toFixed?.(1) || '?'} km<br>` +
          (l.parallel_count > 1 ? `Parallel: ${l.parallel_count} circuits` : '')
        );
        return polyline;
      });
    layers.lines = L.layerGroup(lineFeatures).addTo(map);

    // Transformers
    const trafoFeatures = data.transformers
      .filter(t => validBusIds.has(t.bus0) && validBusIds.has(t.bus1))
      .map(t => {
        const c0 = busCoord[t.bus0], c1 = busCoord[t.bus1];
        return L.polyline([c0, c1], {
          color: '#FF9800', weight: 3, opacity: 0.9, dashArray: '6,4'
        }).bindTooltip(`<b>Transformer ${t.trafo_id}</b><br>s_nom: ${t.s_nom?.toFixed(0)} MW<br>tap: ${t.tap_ratio}<br>phase_shift: ${t.phase_shift}°`);
      });
    layers.trafos = L.layerGroup(trafoFeatures).addTo(map);

    // HVDC links — endpoint coords come from the API so interconnectors with a
    // foreign far-end bus (outside the country filter) still draw fully
    const linkFeatures = data.links
      .filter(l => (validBusIds.has(l.bus0) || validBusIds.has(l.bus1)) &&
                   l.x0 != null && l.x1 != null)
      .map(l => {
        const c0 = busCoord[l.bus0] || [l.y0, l.x0];
        const c1 = busCoord[l.bus1] || [l.y1, l.x1];
        return L.polyline([c0, c1], {
          color: '#00e5ff', weight: 4, opacity: 0.9, dashArray: '10,6'
        }).bindTooltip(`<b>HVDC ${l.link_id}</b><br>p_nom: ${l.p_nom?.toFixed(0)} MW<br>length: ${l.length?.toFixed?.(0) || '?'} km<br>${l.carrier}`);
      });
    layers.links = L.layerGroup(linkFeatures).addTo(map);

    document.getElementById('t-summary').innerHTML = `
      <div class="stat"><span>Buses (filtered)</span><span class="val">${busFeatures.length}</span></div>
      <div class="stat"><span>Lines</span><span class="val">${lineFeatures.length}</span></div>
      <div class="stat"><span>Trafos</span><span class="val">${trafoFeatures.length}</span></div>
      <div class="stat"><span>HVDC Links</span><span class="val">${linkFeatures.length}</span></div>`;
  }

  function offsetCoords(b0, b1, offset) {
    const dx = b1[1] - b0[1];
    const dy = b1[0] - b0[0];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-8) return [b0, b1];
    const px = -dy / len * offset;
    const py = dx / len * offset;
    return [[b0[0] + px, b0[1] + py], [b1[0] + px, b1[1] + py]];
  }

  async function showBusDetail(bus_id) {
    App.showDetail('<div class="muted"><span class="spinner"></span>Loading…</div>');
    try {
      const d = await App.api('/api/topology/buses/' + bus_id);
      const fields = [
        ['Bus ID', d.bus_id],
        ['Voltage (kV)', d.v_nom],
        ['Country', d.country],
        ['Carrier', d.carrier],
        ['Lon', d.x?.toFixed?.(5)],
        ['Lat', d.y?.toFixed?.(5)],
        ['Line degree', d.line_degree],
        ['Trafo degree', d.trafo_degree],
        ['Type', d.type],
      ].filter(([_, v]) => v !== null && v !== undefined && v !== '');
      App.showDetail(`
        <h3>Bus #${d.bus_id}</h3>
        <div style="margin: 6px 0; padding: 6px 8px; background: ${App.colorForVoltage(d.v_nom)}30; border-left: 3px solid ${App.colorForVoltage(d.v_nom)}; border-radius: 3px;">
          <b>${d.v_nom} kV</b> · ${d.country}
        </div>
        ${fields.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
        <button class="btn" id="show-plants" style="margin-top:10px;width:100%">Show connected plants</button>
        <div id="plants-panel" style="margin-top:8px"></div>
      `);
      document.getElementById('show-plants').onclick = () => showPlants(bus_id);
    } catch (e) {
      App.showDetail(`<div style="color:#e74c3c">Error: ${e.message}</div>`);
    }
  }

  async function showPlants(bus_id) {
    const panel = document.getElementById('plants-panel');
    if (panel) panel.innerHTML = '<div class="muted"><span class="spinner"></span>Loading plants…</div>';
    try {
      const d = await App.api('/api/topology/buses/' + bus_id + '/plants');

      // Clear any previously drawn plant markers
      if (layers.plants) { mapRef.removeLayer(layers.plants); layers.plants = null; }

      if (!d.plants.length) {
        if (panel) panel.innerHTML = '<div class="muted">No connected plants found for this bus.</div>';
        return;
      }

      const markers = d.plants.map(p => {
        const color = App.colorForCarrier(p.technology);
        const m = L.circleMarker([p.lat, p.lon], {
          radius: Math.max(3, Math.min(14, 3 + Math.sqrt(p.capacity_mw))),
          fillColor: color, color: '#000', weight: 0.6, fillOpacity: 0.85,
        });
        m.bindTooltip(
          `<b>${p.technology}</b><br>` +
          `Capacity: ${p.capacity_mw.toFixed(2)} MW<br>` +
          `MaStR: ${p.mastr_id || '?'}<br>` +
          `${p.bundesland || ''}`
        );
        return m;
      });
      layers.plants = L.layerGroup(markers).addTo(mapRef);

      // Fit map to the plants so the user sees their real spread
      const bounds = L.latLngBounds(d.plants.map(p => [p.lat, p.lon]));
      if (bounds.isValid()) mapRef.fitBounds(bounds.pad(0.2), { maxZoom: 12 });

      // Per-technology legend + counts
      const legend = d.by_technology.map(t => `
        <div class="legend-item" style="justify-content:space-between">
          <span><span class="legend-dot" style="background:${App.colorForCarrier(t.technology)}"></span> ${t.technology}</span>
          <span class="muted">${t.count} · ${t.total_mw.toFixed(0)} MW</span>
        </div>`).join('');
      const capped = d.returned < d.total_count
        ? `<div class="muted" style="margin-top:4px">Showing largest ${d.returned} of ${d.total_count} plants.</div>` : '';
      if (panel) panel.innerHTML = `
        <div class="legend" style="margin-top:4px">${legend}</div>
        ${capped}
        <button class="btn" id="hide-plants" style="margin-top:8px;width:100%">Hide plants</button>`;
      const hide = document.getElementById('hide-plants');
      if (hide) hide.onclick = () => {
        if (layers.plants) { mapRef.removeLayer(layers.plants); layers.plants = null; }
        if (panel) panel.innerHTML = '';
      };
    } catch (e) {
      if (panel) panel.innerHTML = `<div style="color:#e74c3c">Error: ${e.message}</div>`;
    }
  }

  return { activate, deactivate };
})();
