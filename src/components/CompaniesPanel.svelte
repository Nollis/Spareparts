<script>
  import { onMount } from "svelte";
  import {
    listCompanies,
    createCompany,
    updateCompany,
    deleteCompany,
  } from "../lib/api.js";

  let items = [];
  let status = null;
  let isLoading = false;
  let isSaving = false;
  let showCreate = false;

  let newCompany = {
    name: "",
    customer_number: "",
    discount_percent: 0,
    country_code: "",
  };

  function normalizeRows(rows) {
    return rows.map((row) => ({ ...row, dirty: false }));
  }

  async function loadItems() {
    status = null;
    isLoading = true;
    try {
      const rows = await listCompanies();
      items = normalizeRows(rows || []);
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load companies.",
      };
    } finally {
      isLoading = false;
    }
  }

  onMount(loadItems);

  function updateRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value, dirty: true };
    items = next;
  }

  async function saveRow(company, index) {
    status = null;
    isSaving = true;
    try {
      await updateCompany(company.id, {
        name: company.name,
        customer_number: company.customer_number,
        discount_percent: company.discount_percent || 0,
        country_code: company.country_code,
      });
      const next = [...items];
      next[index] = { ...company, dirty: false };
      items = next;
      status = { type: "success", message: "Company saved." };
    } catch (error) {
      status = { type: "error", message: error.message || "Save failed." };
    } finally {
      isSaving = false;
    }
  }

  async function handleCreate() {
    status = null;
    if (!newCompany.name) {
      status = { type: "error", message: "Company name is required." };
      return;
    }
    try {
      await createCompany({
        ...newCompany,
        discount_percent: Number(newCompany.discount_percent || 0),
      });
      newCompany = {
        name: "",
        customer_number: "",
        discount_percent: 0,
        country_code: "",
      };
      showCreate = false;
      await loadItems();
      status = { type: "success", message: "Company created." };
    } catch (error) {
      status = { type: "error", message: error.message || "Create failed." };
    }
  }

  async function handleDelete(id) {
    status = null;
    if (!confirm("Delete this company?")) return;
    try {
      await deleteCompany(id);
      items = items.filter((item) => item.id !== id);
      status = { type: "success", message: "Company deleted." };
    } catch (error) {
      status = { type: "error", message: error.message || "Delete failed." };
    }
  }
</script>

<section>
  <div class="panel-header">
    <p class="hint">Manage companies and their settings.</p>
    <button on:click={() => (showCreate = true)}>+ Create company</button>
  </div>

  {#if status}
    <div class={`status ${status.type}`}>{status.message}</div>
  {/if}

  {#if showCreate}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal-backdrop" on:click={() => (showCreate = false)}>
      <div class="modal-content" on:click|stopPropagation>
        <h3>Create company</h3>
        <div class="form-grid">
          <label>Name<input type="text" bind:value={newCompany.name} /></label>
          <label
            >Customer no<input
              type="text"
              bind:value={newCompany.customer_number}
            /></label
          >
          <label
            >Discount %<input
              type="number"
              min="0"
              max="100"
              bind:value={newCompany.discount_percent}
            /></label
          >
          <label
            >Country<input
              type="text"
              bind:value={newCompany.country_code}
            /></label
          >
        </div>
        <div class="modal-actions">
          <button on:click={handleCreate}>Create</button>
          <button class="secondary" on:click={() => (showCreate = false)}
            >Cancel</button
          >
        </div>
      </div>
    </div>
  {/if}

  <div class="card-list">
    {#if isLoading}
      <p>Loading...</p>
    {:else if items.length === 0}
      <p class="empty">No companies.</p>
    {:else}
      {#each items as item, index}
        <div class="admin-card">
          <div class="admin-card__header">
            <div>
              <strong>{item.name}</strong>
              <span class="admin-card__meta"
                >Customer #{item.customer_number || "-"}</span
              >
            </div>
          </div>
          <div class="admin-card__grid">
            <label>
              Name
              <input
                type="text"
                value={item.name}
                on:input={(e) => updateRow(index, "name", e.target.value)}
              />
            </label>
            <label>
              Customer no
              <input
                type="text"
                value={item.customer_number || ""}
                on:input={(e) =>
                  updateRow(index, "customer_number", e.target.value)}
              />
            </label>
            <label>
              Discount %
              <input
                type="number"
                min="0"
                max="100"
                value={item.discount_percent || 0}
                on:input={(e) =>
                  updateRow(index, "discount_percent", e.target.value)}
              />
            </label>
            <label>
              Country
              <input
                type="text"
                value={item.country_code || ""}
                on:input={(e) =>
                  updateRow(index, "country_code", e.target.value)}
              />
            </label>
          </div>
          <div class="admin-card__actions">
            <button
              class="secondary"
              on:click={() => saveRow(item, index)}
              disabled={!item.dirty || isSaving}
            >
              Save
            </button>
            <button class="danger" on:click={() => handleDelete(item.id)}
              >Delete</button
            >
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>

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

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
