<script>
  import {
    listLanguageCategories,
    listLanguageProducts,
    saveLanguageItems,
  } from "../lib/api.js";

  let mode = "categories";
  let query = "";
  let limit = 200;
  let rows = [];
  let status = null;
  let isLoading = false;
  let isSaving = false;

  function normalizeRows(items) {
    return items.map((item) => ({
      ...item,
      dirty: false,
    }));
  }

  function pendingCount() {
    return rows.filter((row) => row.dirty).length;
  }

  async function loadRows() {
    status = null;
    isLoading = true;
    try {
      const result =
        mode === "categories"
          ? await listLanguageCategories({ query, limit })
          : await listLanguageProducts({ query, limit });
      rows = normalizeRows(result || []);
      if (!rows.length) {
        status = { type: "info", message: "No matches found." };
      }
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load items.",
      };
    } finally {
      isLoading = false;
    }
  }

  function updateRow(index, field, value) {
    const next = [...rows];
    next[index] = { ...next[index], [field]: value, dirty: true };
    rows = next;
  }

  async function saveChanges() {
    const dirtyItems = rows.filter((row) => row.dirty);
    if (!dirtyItems.length) {
      status = { type: "info", message: "No pending changes." };
      return;
    }
    status = null;
    isSaving = true;
    try {
      const payload = {
        type: mode === "categories" ? "category" : "product",
        items: dirtyItems,
      };
      const result = await saveLanguageItems(payload);
      rows = rows.map((row) => ({ ...row, dirty: false }));
      status = { type: "success", message: `Saved ${result.updated} items.` };
    } catch (error) {
      status = { type: "error", message: error.message || "Save failed." };
    } finally {
      isSaving = false;
    }
  }
</script>

<section class="card">
  <div class="inline">
    <button
      class="secondary"
      class:active={mode === "categories"}
      type="button"
      on:click={() => {
        if (mode !== "categories") {
          mode = "categories";
          loadRows();
        }
      }}
    >
      Categories
    </button>
    <button
      class="secondary"
      class:active={mode === "products"}
      type="button"
      on:click={() => {
        if (mode !== "products") {
          mode = "products";
          loadRows();
        }
      }}
    >
      Products
    </button>
  </div>

  <div class="field" style="margin-top: 12px;">
    <label for="lang-search">Search</label>
    <input
      id="lang-search"
      type="text"
      placeholder="Key, SKU, name, or description"
      bind:value={query}
      on:keydown={(event) => {
        if (event.key === "Enter") {
          loadRows();
        }
      }}
    />
  </div>

  <div class="inline">
    <label class="inline" for="limit-input">
      <span style="margin-right: 8px;">Limit</span>
      <input
        id="limit-input"
        type="text"
        style="width: 80px;"
        bind:value={limit}
      />
    </label>
    <button type="button" on:click={loadRows} disabled={isLoading}>
      {isLoading ? "Loading..." : "Load"}
    </button>
    <button
      class="secondary"
      type="button"
      on:click={saveChanges}
      disabled={isSaving}
    >
      {isSaving ? "Saving..." : `Save changes (${pendingCount()})`}
    </button>
  </div>

  {#if status}
    <div class="status">
      <strong>{status.type === "error" ? "Error" : "Status"}:</strong>
      {status.message}
    </div>
  {/if}
</section>

{#if rows.length}
  <section class="panel">
    {#each rows as row, index}
      <div class={`lang-row ${row.dirty ? "dirty" : ""}`}>
        <div class="lang-meta">
          {#if mode === "categories"}
            <div class="lang-id">Key: {row.key}</div>
            <div class="lang-sub">Path: {row.path}</div>
          {:else}
            <div class="lang-id">SKU: {row.sku}</div>
          {/if}
        </div>
        <div class="lang-cols">
          <div class="lang-col">
            <h3>SV</h3>
            <input
              type="text"
              placeholder="Name (SV)"
              value={row.name_sv || ""}
              on:input={(event) =>
                updateRow(index, "name_sv", event.target.value)}
            />
            <textarea
              rows="3"
              placeholder="Description (SV)"
              value={row.desc_sv || ""}
              on:input={(event) =>
                updateRow(index, "desc_sv", event.target.value)}
            ></textarea>
          </div>
          <div class="lang-col">
            <h3>EN</h3>
            <input
              type="text"
              placeholder="Name (EN)"
              value={row.name_en || ""}
              on:input={(event) =>
                updateRow(index, "name_en", event.target.value)}
            />
            <textarea
              rows="3"
              placeholder="Description (EN)"
              value={row.desc_en || ""}
              on:input={(event) =>
                updateRow(index, "desc_en", event.target.value)}
            ></textarea>
          </div>
          <div class="lang-col">
            <h3>PL</h3>
            <input
              type="text"
              placeholder="Name (PL)"
              value={row.name_pl || ""}
              on:input={(event) =>
                updateRow(index, "name_pl", event.target.value)}
            />
            <textarea
              rows="3"
              placeholder="Description (PL)"
              value={row.desc_pl || ""}
              on:input={(event) =>
                updateRow(index, "desc_pl", event.target.value)}
            ></textarea>
          </div>
        </div>
      </div>
    {/each}
  </section>
{/if}

<style>
  .lang-row {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 10px 30px rgba(27, 27, 27, 0.05);
    display: grid;
    gap: 14px;
  }

  .lang-row.dirty {
    border-color: #c6a46a;
    box-shadow: 0 10px 30px rgba(198, 164, 106, 0.18);
  }

  .lang-meta {
    display: grid;
    gap: 4px;
  }

  .lang-id {
    font-weight: 700;
  }

  .lang-sub {
    font-size: 13px;
    color: var(--muted);
  }

  .lang-cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
  }

  .lang-col h3 {
    margin: 0 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--brand-dark);
  }

  .lang-col input,
  .lang-col textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: "Manrope", "Segoe UI", sans-serif;
  }

  .lang-col textarea {
    resize: vertical;
    margin-top: 8px;
    background: #fffdfa;
  }
</style>
