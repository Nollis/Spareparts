<script>
  import { onMount } from "svelte";
  import {
    addMachineCategoryLink,
    createMachineCategory,
    deleteMachineCategory,
    listCategories,
    listMachineCategories,
    removeMachineCategoryLink,
    updateMachineCategories,
  } from "../lib/api.js";

  let query = "";
  let limit = 200;
  let items = [];
  let status = null;
  let isLoading = false;
  let isSaving = false;
  let cascadeDelete = false;
  let categorySuggestions = [];
  let showCreate = false;

  let newItem = {
    key: "",
    name_sv: "",
    name_en: "",
    position: "",
    parent_id: "0",
  };

  function normalizeRows(rows) {
    return rows.map((row) => ({
      ...row,
      dirty: false,
      linkDirty: false,
      newLinkKey: "",
      newLinkPosition: "",
    }));
  }

  async function loadSuggestions() {
    try {
      const categories = await listCategories({ query: "", limit: 500 });
      categorySuggestions = categories.map((item) => item.key);
    } catch (error) {
      categorySuggestions = [];
    }
  }

  async function loadItems() {
    status = null;
    isLoading = true;
    try {
      const rows = await listMachineCategories({ query, limit });
      items = normalizeRows(rows || []);
      if (!items.length) {
        status = { type: "info", message: "No machine categories found." };
      }
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load machine categories.",
      };
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadSuggestions();
  });

  function updateRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value, dirty: true };
    items = next;
  }

  function updateLinkPosition(index, linkIndex, value) {
    const next = [...items];
    const links = [...(next[index].product_categories || [])];
    links[linkIndex] = { ...links[linkIndex], position: value };
    next[index] = {
      ...next[index],
      product_categories: links,
      linkDirty: true,
    };
    items = next;
  }

  async function saveChanges() {
    const dirtyItems = items.filter((item) => item.dirty);
    if (!dirtyItems.length) {
      status = { type: "info", message: "No pending changes." };
      return;
    }
    status = null;
    isSaving = true;
    try {
      await updateMachineCategories({ items: dirtyItems });
      items = items.map((item) => ({ ...item, dirty: false }));
      status = {
        type: "success",
        message: `Saved ${dirtyItems.length} machine categories.`,
      };
    } catch (error) {
      status = { type: "error", message: error.message || "Save failed." };
    } finally {
      isSaving = false;
    }
  }

  async function handleCreate() {
    status = null;
    if (!newItem.key && !newItem.name_sv && !newItem.name_en) {
      status = { type: "error", message: "Provide a key or a name." };
      return;
    }
    try {
      await createMachineCategory(newItem);
      newItem = {
        key: "",
        name_sv: "",
        name_en: "",
        position: "",
        parent_id: "0",
      };
      showCreate = false;
      await loadItems();
      status = { type: "success", message: "Machine category created." };
    } catch (error) {
      status = { type: "error", message: error.message || "Create failed." };
    }
  }

  async function handleDelete(id) {
    status = null;
    if (!confirm("Delete this machine category?")) {
      return;
    }
    try {
      await deleteMachineCategory(id, { cascade: cascadeDelete });
      await loadItems();
    } catch (error) {
      status = { type: "error", message: error.message || "Delete failed." };
    }
  }

  async function handleAddLink(index) {
    const item = items[index];
    const key = item.newLinkKey?.trim();
    if (!key) {
      return;
    }
    const position = item.newLinkPosition ? Number(item.newLinkPosition) : 0;
    try {
      await addMachineCategoryLink(
        item.id,
        key,
        Number.isNaN(position) ? 0 : position,
      );
      const next = [...items];
      const existing = next[index].product_categories || [];
      if (!existing.find((entry) => entry.key === key)) {
        existing.push({
          key,
          slug: key,
          position: String(position || 0),
          name: key,
          lang_name: { se: "", en: "" },
        });
      }
      next[index] = {
        ...next[index],
        product_categories: existing,
        newLinkKey: "",
        newLinkPosition: "",
      };
      items = next;
    } catch (error) {
      status = { type: "error", message: error.message || "Add link failed." };
    }
  }

  async function handleRemoveLink(index, categoryKey) {
    const item = items[index];
    try {
      await removeMachineCategoryLink(item.id, categoryKey);
      const next = [...items];
      next[index] = {
        ...next[index],
        product_categories: (next[index].product_categories || []).filter(
          (entry) => entry.key !== categoryKey,
        ),
      };
      items = next;
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Remove link failed.",
      };
    }
  }

  async function saveLinkPositions(index) {
    const item = items[index];
    const links = item.product_categories || [];
    if (!links.length) {
      return;
    }
    status = null;
    try {
      await Promise.all(
        links.map((link) =>
          addMachineCategoryLink(item.id, link.key, Number(link.position || 0)),
        ),
      );
      const next = [...items];
      next[index] = { ...next[index], linkDirty: false };
      items = next;
      status = { type: "success", message: "Linked category positions saved." };
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Save links failed.",
      };
    }
  }
</script>

<section>
  <div class="panel-header">
    <p class="hint">Create and map machine categories to product categories.</p>
    <button on:click={() => (showCreate = true)}>+ Add category</button>
  </div>

  {#if status}
    <div class="status">
      <strong>{status.type === "error" ? "Error" : "Status"}:</strong>
      {status.message}
    </div>
  {/if}

  {#if showCreate}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal-backdrop" on:click={() => (showCreate = false)}>
      <div class="modal-content" on:click|stopPropagation>
        <h3>Add machine category</h3>
        <div class="form-grid">
          <label
            >Key (optional)<input type="text" bind:value={newItem.key} /></label
          >
          <label
            >Name SV<input type="text" bind:value={newItem.name_sv} /></label
          >
          <label
            >Name EN<input type="text" bind:value={newItem.name_en} /></label
          >
          <label
            >Position<input type="text" bind:value={newItem.position} /></label
          >
          <label
            >Parent
            <select bind:value={newItem.parent_id}>
              <option value="0">No parent</option>
              {#each items as option}
                <option value={option.id}
                  >{option.name_sv || option.name_en || option.key}</option
                >
              {/each}
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" on:click={handleCreate}>Add</button>
          <button class="secondary" on:click={() => (showCreate = false)}
            >Cancel</button
          >
        </div>
      </div>
    </div>
  {/if}

  <div class="panel-card">
    <div class="section-title">Find &amp; update</div>
    <div class="inline">
      <label class="inline">
        <span style="margin-right: 8px;">Search</span>
        <input type="text" placeholder="Key or name" bind:value={query} />
      </label>
      <label class="inline">
        <span style="margin-right: 8px;">Limit</span>
        <input type="text" style="width: 80px;" bind:value={limit} />
      </label>
      <button type="button" on:click={loadItems} disabled={isLoading}>
        {isLoading ? "Loading..." : "Load"}
      </button>
      <button
        class="secondary"
        type="button"
        on:click={saveChanges}
        disabled={isSaving}
      >
        {isSaving ? "Saving..." : "Save changes"}
      </button>
      <label class="inline">
        <input type="checkbox" bind:checked={cascadeDelete} />
        <span style="margin-left: 6px;">Cascade delete</span>
      </label>
    </div>
  </div>

  {#if items.length}
    <div class="tree-list">
      {#each items as item, index}
        <div class={`tree-row ${item.dirty ? "dirty" : ""}`}>
          <div class="tree-meta">
            <div class="tree-title">{item.key}</div>
            <div class="tree-sub">ID: {item.id}</div>
            {#if item.parent_id}
              <div class="tree-sub">Parent: {item.parent_id}</div>
            {/if}
          </div>
          <div class="tree-fields">
            <div class="field-block">
              <div class="field-label">Name (SV)</div>
              <div class="field-help">Displayed in Swedish.</div>
              <input
                type="text"
                placeholder="Name in Swedish"
                value={item.name_sv || ""}
                on:input={(event) =>
                  updateRow(index, "name_sv", event.target.value)}
              />
            </div>
            <div class="field-block">
              <div class="field-label">Name (EN)</div>
              <div class="field-help">Displayed in English.</div>
              <input
                type="text"
                placeholder="Name in English"
                value={item.name_en || ""}
                on:input={(event) =>
                  updateRow(index, "name_en", event.target.value)}
              />
            </div>
            <div class="inline">
              <div class="field-block compact">
                <div class="field-label">Position</div>
                <div class="field-help">Lower number sorts first.</div>
                <input
                  type="text"
                  style="width: 120px;"
                  placeholder="Order"
                  value={item.position || ""}
                  on:input={(event) =>
                    updateRow(index, "position", event.target.value)}
                />
              </div>
              <div class="field-block compact">
                <div class="field-label">Parent</div>
                <div class="field-help">Optional parent group.</div>
                <select
                  value={item.parent_id || 0}
                  on:change={(event) =>
                    updateRow(index, "parent_id", event.target.value)}
                >
                  <option value="0">No parent</option>
                  {#each items as option}
                    <option value={option.id}
                      >{option.name_sv || option.name_en || option.key}</option
                    >
                  {/each}
                </select>
              </div>
              <button
                class="danger"
                type="button"
                on:click={() => handleDelete(item.id)}>Delete</button
              >
            </div>

            <div class="link-section">
              <div class="field-label">Linked product categories</div>
              <div class="field-help">
                Add product category keys to show under this machine category.
              </div>
              <div class="category-tags">
                {#each item.product_categories || [] as link, linkIndex}
                  <span class="tag">
                    {link.key}
                    <input
                      type="text"
                      class="tag-input"
                      value={link.position || "0"}
                      on:input={(event) =>
                        updateLinkPosition(
                          index,
                          linkIndex,
                          event.target.value,
                        )}
                    />
                    <button
                      type="button"
                      on:click={() => handleRemoveLink(index, link.key)}
                      >x</button
                    >
                  </span>
                {/each}
              </div>
              <div class="inline">
                <input
                  list="machine-category-keys"
                  type="text"
                  placeholder="Add category key"
                  value={item.newLinkKey}
                  on:input={(event) =>
                    updateRow(index, "newLinkKey", event.target.value)}
                />
                <input
                  type="text"
                  style="width: 110px;"
                  placeholder="Position"
                  value={item.newLinkPosition}
                  on:input={(event) =>
                    updateRow(index, "newLinkPosition", event.target.value)}
                />
                <button
                  type="button"
                  class="secondary"
                  on:click={() => handleAddLink(index)}
                >
                  Add link
                </button>
                <button
                  type="button"
                  class="secondary"
                  on:click={() => saveLinkPositions(index)}
                  disabled={!item.linkDirty}
                >
                  Save link positions
                </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<datalist id="machine-category-keys">
  {#each categorySuggestions as key}
    <option value={key}></option>
  {/each}
</datalist>

<style>
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    background: rgba(255, 255, 255, 0.5);
    padding: 16px 20px;
    border-radius: 12px;
    border: 1px solid rgba(225, 216, 207, 0.6);
  }

  .panel-header .hint {
    margin: 0;
    font-size: 0.95rem;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(27, 27, 31, 0.4);
    backdrop-filter: blur(4px);
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 24px;
    animation: fade-in 0.2s ease-out;
  }

  .modal-content {
    background: #fff;
    width: 100%;
    max-width: 680px;
    padding: 32px;
    border-radius: 20px;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06),
      0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .modal-content h3 {
    margin: 0 0 24px;
    font-size: 1.5rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .tree-list {
    display: grid;
    gap: 16px;
    margin-top: 16px;
  }

  .tree-row {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 16px;
    display: grid;
    gap: 12px;
    box-shadow: 0 10px 26px rgba(27, 27, 27, 0.05);
  }

  .tree-row.dirty {
    border-color: #c6a46a;
    box-shadow: 0 10px 26px rgba(198, 164, 106, 0.2);
  }

  .tree-meta {
    display: grid;
    gap: 4px;
  }

  .tree-title {
    font-weight: 700;
  }

  .panel-card {
    margin-top: 14px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--border);
    box-shadow: 0 14px 28px rgba(25, 22, 19, 0.08);
  }

  .section-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 700;
    margin-bottom: 10px;
  }

  .tree-sub {
    font-size: 12px;
    color: var(--muted);
  }

  .tree-fields {
    display: grid;
    gap: 10px;
  }

  .field-block {
    display: grid;
    gap: 6px;
  }

  .field-block.compact {
    gap: 4px;
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

  .category-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: #eef3f0;
    border: 1px solid #cfe1d8;
    font-size: 12px;
  }

  .tag-input {
    width: 48px;
    padding: 2px 6px;
    border-radius: 8px;
    border: 1px solid var(--line);
    font-size: 12px;
  }

  .tag button {
    border: none;
    background: transparent;
    color: var(--muted);
    font-weight: 700;
    cursor: pointer;
    padding: 0 4px;
  }

  .link-section {
    margin-top: 8px;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
