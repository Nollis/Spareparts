<script>
  import { onMount } from "svelte";
  import {
    listAdminDeliveryAddresses,
    createDeliveryAddress,
    updateDeliveryAddress,
    deleteDeliveryAddress,
    listCompanies,
  } from "../lib/api.js";

  let items = [];
  let companies = [];
  let status = null;
  let isLoading = false;
  let isSaving = false;
  let companyFilter = "";
  let showCreate = false;

  let newAddress = {
    company_id: "",
    attn_first_name: "",
    attn_last_name: "",
    street: "",
    street_2: "",
    zip_code: "",
    postal_area: "",
    country: "",
    delivery_id: "",
  };

  function normalizeRows(rows) {
    return rows.map((row) => ({ ...row, dirty: false }));
  }

  async function loadData() {
    status = null;
    isLoading = true;
    try {
      const [addressRows, companyRows] = await Promise.all([
        listAdminDeliveryAddresses(companyFilter),
        listCompanies(),
      ]);
      items = normalizeRows(addressRows || []);
      companies = companyRows || [];
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load delivery addresses.",
      };
    } finally {
      isLoading = false;
    }
  }

  onMount(loadData);

  function updateRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value, dirty: true };
    items = next;
  }

  async function saveRow(address, index) {
    status = null;
    isSaving = true;
    try {
      await updateDeliveryAddress(address.id, {
        ...address,
        company_id: address.company_id || null,
      });
      const next = [...items];
      next[index] = { ...address, dirty: false };
      items = next;
      status = { type: "success", message: "Address saved." };
    } catch (error) {
      status = { type: "error", message: error.message || "Save failed." };
    } finally {
      isSaving = false;
    }
  }

  async function handleCreate() {
    status = null;
    if (!newAddress.company_id) {
      status = { type: "error", message: "Company is required." };
      return;
    }
    try {
      await createDeliveryAddress({
        ...newAddress,
        company_id: Number(newAddress.company_id),
      });
      newAddress = {
        company_id: "",
        attn_first_name: "",
        attn_last_name: "",
        street: "",
        street_2: "",
        zip_code: "",
        postal_area: "",
        country: "",
        delivery_id: "",
      };
      showCreate = false;
      await loadData();
      status = { type: "success", message: "Address created." };
    } catch (error) {
      status = { type: "error", message: error.message || "Create failed." };
    }
  }

  async function handleDelete(id) {
    status = null;
    if (!confirm("Delete this address?")) return;
    try {
      await deleteDeliveryAddress(id);
      items = items.filter((item) => item.id !== id);
      status = { type: "success", message: "Address deleted." };
    } catch (error) {
      status = { type: "error", message: error.message || "Delete failed." };
    }
  }
</script>

<section>
  <div class="panel-header">
    <p class="hint">Manage delivery addresses per company.</p>
    <button on:click={() => (showCreate = true)}>+ Create address</button>
  </div>

  {#if status}
    <div class={`status ${status.type}`}>{status.message}</div>
  {/if}

  {#if showCreate}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal-backdrop" on:click={() => (showCreate = false)}>
      <div class="modal-content" on:click|stopPropagation>
        <h3>Create address</h3>
        <div class="form-grid">
          <label
            >Company
            <select bind:value={newAddress.company_id}>
              <option value="">Select</option>
              {#each companies as company}
                <option value={String(company.id)}>{company.name}</option>
              {/each}
            </select>
          </label>
          <label
            >First name<input
              type="text"
              bind:value={newAddress.attn_first_name}
            /></label
          >
          <label
            >Last name<input
              type="text"
              bind:value={newAddress.attn_last_name}
            /></label
          >
          <label
            >Street<input type="text" bind:value={newAddress.street} /></label
          >
          <label
            >Street 2<input
              type="text"
              bind:value={newAddress.street_2}
            /></label
          >
          <label
            >Zip<input type="text" bind:value={newAddress.zip_code} /></label
          >
          <label
            >City<input
              type="text"
              bind:value={newAddress.postal_area}
            /></label
          >
          <label
            >Country<input type="text" bind:value={newAddress.country} /></label
          >
          <label
            >Delivery id<input
              type="text"
              bind:value={newAddress.delivery_id}
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

  <div class="panel-card">
    <h3>Filter</h3>
    <div class="form-grid">
      <label
        >Company
        <select bind:value={companyFilter} on:change={loadData}>
          <option value="">All</option>
          {#each companies as company}
            <option value={String(company.id)}>{company.name}</option>
          {/each}
        </select>
      </label>
    </div>
  </div>

  <div class="card-list">
    {#if isLoading}
      <p>Loading...</p>
    {:else if items.length === 0}
      <p class="empty">No addresses.</p>
    {:else}
      {#each items as item, index}
        <div class="admin-card">
          <div class="admin-card__header">
            <div>
              <strong>{item.street || "Address"}</strong>
              <span class="admin-card__meta"
                >{item.postal_area || ""} {item.zip_code || ""}</span
              >
            </div>
            <span class="admin-badge">{item.country || "-"}</span>
          </div>
          <div class="admin-card__grid">
            <label>
              Company
              <select
                value={item.company_id || ""}
                on:change={(e) =>
                  updateRow(index, "company_id", e.target.value)}
              >
                <option value="">(none)</option>
                {#each companies as company}
                  <option value={String(company.id)}>{company.name}</option>
                {/each}
              </select>
            </label>
            <label>
              First name
              <input
                type="text"
                value={`${item.attn_first_name || ""}`}
                on:input={(e) =>
                  updateRow(index, "attn_first_name", e.target.value)}
              />
            </label>
            <label>
              Last name
              <input
                type="text"
                value={`${item.attn_last_name || ""}`}
                on:input={(e) =>
                  updateRow(index, "attn_last_name", e.target.value)}
              />
            </label>
            <label>
              Street
              <input
                type="text"
                value={item.street || ""}
                on:input={(e) => updateRow(index, "street", e.target.value)}
              />
            </label>
            <label>
              Street 2
              <input
                type="text"
                value={item.street_2 || ""}
                on:input={(e) => updateRow(index, "street_2", e.target.value)}
              />
            </label>
            <label>
              Zip
              <input
                type="text"
                value={item.zip_code || ""}
                on:input={(e) => updateRow(index, "zip_code", e.target.value)}
              />
            </label>
            <label>
              City
              <input
                type="text"
                value={item.postal_area || ""}
                on:input={(e) =>
                  updateRow(index, "postal_area", e.target.value)}
              />
            </label>
            <label>
              Country
              <input
                type="text"
                value={item.country || ""}
                on:input={(e) => updateRow(index, "country", e.target.value)}
              />
            </label>
            <label>
              Delivery id
              <input
                type="text"
                value={item.delivery_id || ""}
                on:input={(e) =>
                  updateRow(index, "delivery_id", e.target.value)}
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
