<script>
  import { onMount } from "svelte";
  import {
    deleteImageMap,
    getImageMapDetails,
    listImageMaps,
    listMainProducts,
    saveImageMap,
  } from "../lib/api.js";

  let mainKeys = [];
  let mainKey = "";
  let listItems = [];
  let selectedKey = "";
  let details = null;
  let hotspots = [];
  let selectedId = "";
  let status = null;
  let isLoading = false;
  let isSaving = false;
  let onlyMissing = false;

  let imageEl = null;
  let imageWrapperEl = null;
  let scaleX = 1;
  let scaleY = 1;
  let imageWidth = 1;
  let imageHeight = 1;
  let dragState = null;
  let resizeObserver = null;
  const apiBase =
    (typeof import.meta !== "undefined"
      ? import.meta.env?.VITE_API_BASE
      : "") || "";
  const apiOrigin = apiBase ? apiBase.replace(/\/api\/?$/, "") : "";
  let childLabelCounts = {};

  function normalizeLabel(value) {
    return String(value || "").trim();
  }

  function resolveUrl(url) {
    if (!url) {
      return "";
    }
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    if (url.startsWith("/") && apiOrigin) {
      return `${apiOrigin}${url}`;
    }
    return url;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getPointerPosition(event) {
    if (!imageEl) {
      return { x: 0, y: 0 };
    }
    const rect = imageEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const naturalX = x / (scaleX || 1);
    const naturalY = y / (scaleY || 1);
    return {
      x: clamp(naturalX, 0, imageWidth || 1),
      y: clamp(naturalY, 0, imageHeight || 1),
    };
  }

  function updateScale() {
    if (!imageEl) {
      return;
    }
    const rect = imageEl.getBoundingClientRect();
    if (!imageEl.naturalWidth || !imageEl.naturalHeight) {
      scaleX = 1;
      scaleY = 1;
      return;
    }
    imageWidth = imageEl.naturalWidth;
    imageHeight = imageEl.naturalHeight;
    scaleX = rect.width / imageEl.naturalWidth;
    scaleY = rect.height / imageEl.naturalHeight;
    if (hotspots.length) {
      hotspots = hotspots.map(ensureOrderedCoords);
    }
  }

  function ensureOrderedCoords(area) {
    const x1 = Math.min(area.x1, area.x2);
    const x2 = Math.max(area.x1, area.x2);
    const y1 = Math.min(area.y1, area.y2);
    const y2 = Math.max(area.y1, area.y2);
    const maxX = imageWidth > 1 ? imageWidth : x2;
    const maxY = imageHeight > 1 ? imageHeight : y2;
    return {
      ...area,
      x1: clamp(x1, 0, maxX),
      x2: clamp(x2, 0, maxX),
      y1: clamp(y1, 0, maxY),
      y2: clamp(y2, 0, maxY),
    };
  }

  function parseMapHtml(html) {
    if (!html) {
      return [];
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const areas = Array.from(doc.querySelectorAll("area"));
      return areas
        .map((area) => {
          const coords = (area.getAttribute("coords") || "")
            .split(",")
            .map((v) => Number(v.trim()));
          if (coords.length !== 4 || coords.some((v) => Number.isNaN(v))) {
            return null;
          }
          const href = area.getAttribute("href") || "";
          let label = area.getAttribute("title") || "";
          if (!label && href.includes("highlight=")) {
            const match = href.match(/[?&]highlight=([^&]+)/);
            if (match) {
              label = match[1];
            }
          }
          if (!label && href && !href.startsWith("?")) {
            label = href;
          }
          return {
            id: crypto.randomUUID(),
            x1: coords[0],
            y1: coords[1],
            x2: coords[2],
            y2: coords[3],
            label: normalizeLabel(label),
          };
        })
        .filter(Boolean)
        .map(ensureOrderedCoords);
    } catch (error) {
      return [];
    }
  }

  function extractDigits(label) {
    const match = String(label || "").match(/\d+/g);
    if (!match) {
      return "";
    }
    return match.join("");
  }

  function resolveHrefForLabel(label) {
    const value = normalizeLabel(label);
    if (!value) {
      return "#";
    }
    const children = details?.child_categories || [];
    if (!children.length) {
      return `?highlight=${value}`;
    }
    const matches = children.filter(
      (child) =>
        normalizeLabel(child.display_label || child.pos_label) === value,
    );
    if (matches.length === 1) {
      return matches[0].key;
    }
    if (matches.length > 1) {
      return matches
        .map((match, index) => `slug_${index + 1}=${match.key}`)
        .reduce(
          (acc, item, index) => (index === 0 ? `?${item}` : `${acc}&${item}`),
          "",
        );
    }
    const numeric = extractDigits(value);
    const numericMatches = children.filter(
      (child) =>
        extractDigits(child.display_label || child.pos_label) === numeric,
    );
    if (numericMatches.length === 1) {
      return numericMatches[0].key;
    }
    if (numericMatches.length > 1) {
      return numericMatches
        .map((match, index) => `slug_${index + 1}=${match.key}`)
        .reduce(
          (acc, item, index) => (index === 0 ? `?${item}` : `${acc}&${item}`),
          "",
        );
    }
    if (/^\d+$/.test(value)) {
      const index = Number(value) - 1;
      if (index >= 0 && index < children.length) {
        return children[index].key;
      }
    }
    return "#";
  }

  function buildMapHtml() {
    const areas = hotspots.map((spot) => {
      const coords = [
        Math.round(spot.x1),
        Math.round(spot.y1),
        Math.round(spot.x2),
        Math.round(spot.y2),
      ];
      const href = resolveHrefForLabel(spot.label);
      const title = normalizeLabel(spot.label);
      const titleAttr = title ? ` title="${title}"` : "";
      return `<area shape="rect" coords="${coords.join(",")}" href="${href}"${titleAttr}>`;
    });
    return `<map name="imagemap">${areas.join("")}</map>`;
  }

  function getSuggestedLabel() {
    const children = details?.child_categories || [];
    if (children.length) {
      const labels = children.map((child) =>
        normalizeLabel(child.display_label || child.pos_label),
      );
      const used = new Set(hotspots.map((spot) => normalizeLabel(spot.label)));
      const available = labels.find((label) => label && !used.has(label));
      return available || labels[0] || "";
    }
    const usedNumbers = new Set(
      hotspots
        .map((spot) => Number(extractDigits(spot.label)))
        .filter((value) => Number.isFinite(value) && value > 0),
    );
    let candidate = 1;
    while (usedNumbers.has(candidate)) {
      candidate += 1;
    }
    return String(candidate);
  }

  async function loadMainKeys() {
    try {
      mainKeys = await listMainProducts();
      if (!mainKey && mainKeys.length) {
        mainKey = mainKeys[0].key;
      }
    } catch (error) {
      mainKeys = [];
    }
  }

  async function loadList() {
    if (!mainKey) {
      listItems = [];
      return;
    }
    status = null;
    isLoading = true;
    try {
      const items = await listImageMaps(mainKey);
      listItems = onlyMissing ? items.filter((item) => !item.has_map) : items;
      if (selectedKey && !listItems.find((item) => item.key === selectedKey)) {
        selectedKey = "";
        details = null;
        hotspots = [];
        selectedId = "";
      }
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load image maps.",
      };
    } finally {
      isLoading = false;
    }
  }

  async function selectCategory(key) {
    selectedKey = key;
    status = null;
    isLoading = true;
    try {
      details = await getImageMapDetails(key);
      hotspots = parseMapHtml(details?.map?.html || "");
      selectedId = hotspots[0]?.id || "";
      const labels = (details?.child_categories || []).map((child) =>
        normalizeLabel(child.pos_label || child.position),
      );
      childLabelCounts = labels.reduce((acc, label) => {
        if (!label) {
          return acc;
        }
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      updateScale();
    } catch (error) {
      details = null;
      hotspots = [];
      status = {
        type: "error",
        message: error.message || "Could not load image map.",
      };
    } finally {
      isLoading = false;
    }
  }

  async function handleSave() {
    if (!details) {
      return;
    }
    status = null;
    isSaving = true;
    try {
      const html = buildMapHtml();
      await saveImageMap(details.key, html);
      status = { type: "success", message: "Image map saved." };
      await loadList();
    } catch (error) {
      status = { type: "error", message: error.message || "Save failed." };
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!details) {
      return;
    }
    if (!confirm("Delete image map for this category?")) {
      return;
    }
    status = null;
    try {
      await deleteImageMap(details.key);
      hotspots = [];
      details = { ...details, map: { html: "", updated_at: "" } };
      await loadList();
    } catch (error) {
      status = { type: "error", message: error.message || "Delete failed." };
    }
  }

  function updateSpot(id, field, value) {
    hotspots = hotspots.map((spot) =>
      spot.id === id ? { ...spot, [field]: value } : spot,
    );
  }

  function removeSpot(id) {
    hotspots = hotspots.filter((spot) => spot.id !== id);
    if (selectedId === id) {
      selectedId = hotspots[0]?.id || "";
    }
  }

  function onPointerDown(event) {
    if (!details || !imageEl) {
      return;
    }
    updateScale();
    const target = event.target;
    const pointer = getPointerPosition(event);
    if (target?.dataset?.handle && target.dataset.hotspotId) {
      const spot = hotspots.find(
        (item) => item.id === target.dataset.hotspotId,
      );
      if (!spot) {
        return;
      }
      selectedId = spot.id;
      dragState = {
        mode: "resize",
        id: spot.id,
        handle: target.dataset.handle,
        startX: pointer.x,
        startY: pointer.y,
        origin: { ...spot },
      };
      return;
    }
    if (target?.dataset?.hotspotId) {
      const spot = hotspots.find(
        (item) => item.id === target.dataset.hotspotId,
      );
      if (!spot) {
        return;
      }
      selectedId = spot.id;
      dragState = {
        mode: "move",
        id: spot.id,
        startX: pointer.x,
        startY: pointer.y,
        origin: { ...spot },
      };
      return;
    }
    const id = crypto.randomUUID();
    const label = getSuggestedLabel();
    const newSpot = {
      id,
      x1: pointer.x,
      y1: pointer.y,
      x2: pointer.x,
      y2: pointer.y,
      label,
    };
    hotspots = [...hotspots, newSpot];
    selectedId = id;
    dragState = {
      mode: "create",
      id,
      startX: pointer.x,
      startY: pointer.y,
      origin: { ...newSpot },
    };
  }

  function onPointerMove(event) {
    if (!dragState) {
      return;
    }
    const pointer = getPointerPosition(event);
    const { id, origin } = dragState;
    if (!origin) {
      return;
    }
    if (dragState.mode === "create") {
      updateSpot(id, "x2", pointer.x);
      updateSpot(id, "y2", pointer.y);
      hotspots = hotspots.map((spot) =>
        spot.id === id ? ensureOrderedCoords(spot) : spot,
      );
      return;
    }
    if (dragState.mode === "move") {
      const dx = pointer.x - dragState.startX;
      const dy = pointer.y - dragState.startY;
      updateSpot(id, "x1", origin.x1 + dx);
      updateSpot(id, "y1", origin.y1 + dy);
      updateSpot(id, "x2", origin.x2 + dx);
      updateSpot(id, "y2", origin.y2 + dy);
      hotspots = hotspots.map((spot) =>
        spot.id === id ? ensureOrderedCoords(spot) : spot,
      );
      return;
    }
    if (dragState.mode === "resize") {
      let { x1, y1, x2, y2 } = origin;
      if (dragState.handle.includes("e")) {
        x2 = pointer.x;
      }
      if (dragState.handle.includes("w")) {
        x1 = pointer.x;
      }
      if (dragState.handle.includes("s")) {
        y2 = pointer.y;
      }
      if (dragState.handle.includes("n")) {
        y1 = pointer.y;
      }
      updateSpot(id, "x1", x1);
      updateSpot(id, "y1", y1);
      updateSpot(id, "x2", x2);
      updateSpot(id, "y2", y2);
      hotspots = hotspots.map((spot) =>
        spot.id === id ? ensureOrderedCoords(spot) : spot,
      );
    }
  }

  function onPointerUp() {
    if (!dragState) {
      return;
    }
    const { id } = dragState;
    const spot = hotspots.find((item) => item.id === id);
    if (spot) {
      const width = Math.abs(spot.x2 - spot.x1);
      const height = Math.abs(spot.y2 - spot.y1);
      if (width < 10 || height < 10) {
        removeSpot(id);
      }
    }
    dragState = null;
  }

  onMount(async () => {
    await loadMainKeys();
    await loadList();
  });

  $: if (mainKey) {
    loadList();
  }

  $: if (!details) {
    childLabelCounts = {};
  }

  $: if (imageWrapperEl && !resizeObserver) {
    resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(imageWrapperEl);
  }
</script>

<section class="card">
  <div class="inline">
    <label class="inline">
      <span style="margin-right: 8px;">Main key</span>
      <select bind:value={mainKey}>
        {#each mainKeys as item}
          <option value={item.key}>{item.name}</option>
        {/each}
      </select>
    </label>
    <label class="inline">
      <input type="checkbox" bind:checked={onlyMissing} />
      <span style="margin-left: 6px;">Only missing maps</span>
    </label>
    <button type="button" on:click={loadList} disabled={isLoading}>
      {isLoading ? "Loading..." : "Refresh list"}
    </button>
  </div>

  {#if status}
    <div class="status">
      <strong>{status.type === "error" ? "Error" : "Status"}:</strong>
      {status.message}
    </div>
  {/if}
</section>

<section class="map-layout">
  <div class="card map-list">
    <h3>Categories</h3>
    {#if listItems.length === 0}
      <p class="muted">No categories found.</p>
    {:else}
      <div class="list">
        {#each listItems as item}
          <button
            class={`list-item ${selectedKey === item.key ? "active" : ""}`}
            type="button"
            on:click={() => selectCategory(item.key)}
          >
            <span>{item.name}</span>
            <span class={`pill ${item.has_map ? "ok" : "missing"}`}>
              {item.has_map ? "Has map" : "Missing"}
            </span>
          </button>
          {#if item.updated_at}
            <div class="list-meta">Updated: {item.updated_at}</div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <div class="card map-editor">
    <h3>Editor</h3>
    {#if !details}
      <p class="muted">Select a category to start editing.</p>
    {:else}
      <div class="editor-grid">
        <div class="editor-canvas">
          {#if details.image_url}
            <div class="canvas-wrapper" bind:this={imageWrapperEl}>
              <img
                src={resolveUrl(details.image_url)}
                alt={details.name}
                bind:this={imageEl}
                on:load={updateScale}
              />
              <svg
                class="overlay"
                viewBox={`0 0 ${imageWidth || 1} ${imageHeight || 1}`}
                on:pointerdown|preventDefault={onPointerDown}
                on:pointermove|preventDefault={onPointerMove}
                on:pointerup|preventDefault={onPointerUp}
                on:pointerleave|preventDefault={onPointerUp}
              >
                {#each hotspots as spot}
                  <rect
                    data-hotspot-id={spot.id}
                    x={spot.x1}
                    y={spot.y1}
                    width={spot.x2 - spot.x1}
                    height={spot.y2 - spot.y1}
                    class={`hotspot ${selectedId === spot.id ? "active" : ""}`}
                  />
                  <text x={spot.x1 + 4} y={spot.y1 + 14} class="hotspot-label">
                    {spot.label}
                  </text>
                  {#if selectedId === spot.id}
                    {#each ["nw", "ne", "sw", "se"] as handle}
                      <circle
                        data-hotspot-id={spot.id}
                        data-handle={handle}
                        class="handle"
                        cx={handle.includes("e") ? spot.x2 : spot.x1}
                        cy={handle.includes("s") ? spot.y2 : spot.y1}
                        r="6"
                      />
                    {/each}
                  {/if}
                {/each}
              </svg>
            </div>
          {:else}
            <p class="muted">
              No image found for {details.key}. Upload image ZIP first.
            </p>
          {/if}
        </div>
        <div class="editor-sidebar">
          <div class="sidebar-column">
            <div class="field-block">
              <div class="field-label">Selected category</div>
              <div class="field-help">{details.name}</div>
            </div>
            {#if details.child_categories?.length}
              <div class="field-block">
                <div class="field-label">Child categories</div>
                <div class="field-help">
                  Use the label shown below as the hotspot number.
                </div>
                <div class="mini-list">
                  {#each details.child_categories as child}
                    <div class="mini-row">
                      <span
                        class={`tag ${childLabelCounts[normalizeLabel(child.pos_label || child.position)] > 1 ? "tag-dup" : ""}`}
                      >
                        {child.display_label ||
                          child.pos_label ||
                          child.position}
                      </span>
                      <span>{child.name}</span>
                    </div>
                  {/each}
                </div>
                {#if Object.values(childLabelCounts).some((count) => count > 1)}
                  <div class="field-help">
                    Duplicate positions detected in data. Labels are shown as
                    list order (1, 2, 3...).
                  </div>
                {/if}
              </div>
            {:else}
              <div class="field-block">
                <div class="field-label">Highlight mode</div>
                <div class="field-help">
                  No sub-categories. Hotspots will link by number.
                </div>
              </div>
            {/if}
          </div>
          <div class="sidebar-column">
            {#if selectedId}
              {#each hotspots.filter((spot) => spot.id === selectedId) as spot}
                <div class="field-block">
                  <div class="field-label">Hotspot number</div>
                  <input
                    type="text"
                    value={spot.label}
                    on:input={(event) =>
                      updateSpot(spot.id, "label", event.target.value)}
                  />
                </div>
                <button
                  class="danger"
                  type="button"
                  on:click={() => removeSpot(spot.id)}
                >
                  Delete hotspot
                </button>
              {/each}
            {:else}
              <p class="muted">Click a hotspot to edit its number.</p>
            {/if}
            <div class="inline">
              <button type="button" on:click={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save map"}
              </button>
              <button class="secondary" type="button" on:click={handleDelete}>
                Clear map
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .map-layout {
    display: grid;
    grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
    gap: 18px;
  }

  .map-list h3,
  .map-editor h3 {
    margin: 0 0 12px;
  }

  .list {
    display: grid;
    gap: 8px;
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    background: #fff;
    padding: 8px 12px;
    border-radius: 12px;
    text-align: left;
    color: var(--ink);
    box-shadow: none;
    font-weight: 600;
  }

  .list-item:hover {
    background: rgba(239, 125, 50, 0.08);
  }

  .list-item.active {
    border-color: var(--accent);
    box-shadow: 0 10px 18px rgba(239, 125, 50, 0.15);
  }

  .pill {
    font-size: 11px;
    border-radius: 999px;
    padding: 4px 8px;
    border: 1px solid transparent;
  }

  .pill.ok {
    background: rgba(0, 128, 96, 0.1);
    color: #00664c;
    border-color: rgba(0, 128, 96, 0.2);
  }

  .pill.missing {
    background: rgba(184, 64, 36, 0.12);
    color: #8f2f1a;
    border-color: rgba(184, 64, 36, 0.2);
  }

  .list-meta {
    margin-left: 6px;
    font-size: 12px;
    color: var(--muted);
  }

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }

  .canvas-wrapper {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--line);
    background: #fff;
  }

  .canvas-wrapper img {
    display: block;
    width: 100%;
    height: auto;
  }

  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
  }

  .hotspot {
    fill: rgba(239, 125, 50, 0.15);
    stroke: #ef7d32;
    stroke-width: 2;
  }

  .hotspot.active {
    fill: rgba(42, 91, 111, 0.18);
    stroke: #2a5b6f;
  }

  .hotspot-label {
    font-size: 14px;
    fill: #1b1b1f;
    font-weight: 600;
    pointer-events: none;
  }

  .handle {
    fill: #fff;
    stroke: #2a5b6f;
    stroke-width: 2;
    cursor: pointer;
  }

  .editor-sidebar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 18px;
  }

  .sidebar-column {
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .field-block {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
  }

  .field-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .field-help {
    font-size: 12px;
    color: var(--muted);
  }

  .mini-list {
    display: grid;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .mini-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .tag {
    background: #eef3f0;
    border: 1px solid #cfe1d8;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #4b4b55;
  }

  .tag-dup {
    border-color: #e3b9b2;
    background: #f7e9e7;
    color: #b71c1c;
  }
</style>
