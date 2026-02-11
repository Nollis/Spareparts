<script>
  import { onMount } from "svelte";
  import {
    clearMainProductCatalog,
    listMainProductCatalogs,
    uploadMainProductCatalog,
  } from "../lib/api.js";

  let items = [];
  let status = null;
  let isLoading = false;
  let uploads = {};
  const apiBase =
    (typeof import.meta !== "undefined"
      ? import.meta.env?.VITE_API_BASE
      : "") || "";
  const apiOrigin = apiBase ? apiBase.replace(/\/api\/?$/, "") : "";

  async function loadItems() {
    status = null;
    isLoading = true;
    try {
      const result = await listMainProductCatalogs();
      items = result || [];
      if (!items.length) {
        status = {
          type: "info",
          message: "No main products yet. Mark a category as main first.",
        };
      }
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load main products.",
      };
    } finally {
      isLoading = false;
    }
  }

  onMount(loadItems);

  function handleFileChange(key, file) {
    uploads = { ...uploads, [key]: file };
  }

  async function handleUpload(key) {
    const file = uploads[key];
    if (!file) {
      status = { type: "error", message: "Choose a file first." };
      return;
    }
    status = null;
    try {
      const result = await uploadMainProductCatalog(key, file);
      items = items.map((item) =>
        item.key === key ? { ...item, ...result } : item,
      );
      uploads = { ...uploads, [key]: null };
      status = {
        type: "success",
        message: `Updated catalog image for ${key}.`,
      };
    } catch (error) {
      status = { type: "error", message: error.message || "Upload failed." };
    }
  }

  async function handleClear(key) {
    status = null;
    try {
      const result = await clearMainProductCatalog(key);
      items = items.map((item) =>
        item.key === key ? { ...item, ...result } : item,
      );
    } catch (error) {
      status = { type: "error", message: error.message || "Remove failed." };
    }
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
</script>

<section class="card">
  <div class="inline">
    <button type="button" on:click={loadItems} disabled={isLoading}>
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

{#if items.length}
  <section class="panel">
    {#each items as item}
      <div class="catalog-row">
        <div>
          <div class="catalog-title">{item.name}</div>
          <div class="catalog-sub">Key: {item.key}</div>
        </div>
        <div class="catalog-preview">
          {#if item.catalog_url}
            <img
              src={resolveUrl(item.catalog_url)}
              alt={`Catalog for ${item.key}`}
            />
          {:else}
            <div class="catalog-empty">No catalog image</div>
          {/if}
        </div>
        <div class="catalog-actions">
          <input
            type="file"
            accept="image/*"
            on:change={(event) =>
              handleFileChange(item.key, event.target.files[0])}
          />
          <div class="inline">
            <button
              type="button"
              class="secondary"
              on:click={() => handleUpload(item.key)}>Upload</button
            >
            <button
              type="button"
              class="danger"
              on:click={() => handleClear(item.key)}>Remove</button
            >
          </div>
        </div>
      </div>
    {/each}
  </section>
{/if}

<style>
  .catalog-row {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 16px;
    display: grid;
    gap: 16px;
    grid-template-columns: minmax(160px, 1fr) minmax(200px, 260px) minmax(
        220px,
        320px
      );
    align-items: center;
    box-shadow: 0 10px 26px rgba(27, 27, 27, 0.05);
  }

  .catalog-title {
    font-weight: 700;
    margin-bottom: 4px;
  }

  .catalog-sub {
    font-size: 12px;
    color: var(--muted);
  }

  .catalog-preview {
    background: #f8f4ea;
    border-radius: 12px;
    border: 1px dashed #d9d2c4;
    padding: 10px;
    min-height: 120px;
    display: grid;
    place-items: center;
  }

  .catalog-preview img {
    max-width: 100%;
    max-height: 140px;
    object-fit: contain;
  }

  .catalog-empty {
    font-size: 13px;
    color: var(--muted);
  }

  .catalog-actions {
    display: grid;
    gap: 8px;
  }

  @media (max-width: 900px) {
    .catalog-row {
      grid-template-columns: 1fr;
    }
  }
</style>
