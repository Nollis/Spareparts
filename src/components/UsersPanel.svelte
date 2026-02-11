<script>
  import { onMount } from "svelte";
  import {
    listAdminUsers,
    createAdminUser,
    updateAdminUser,
    deleteAdminUser,
    listCompanies,
  } from "../lib/api.js";

  let users = [];
  let companies = [];
  let status = null;
  let isLoading = false;
  let isSaving = false;
  let search = "";
  let statusFilter = "";
  let companyFilter = "";
  let roleFilter = "";

  let showCreate = false;

  let newUser = {
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
    status: "active",
    company_id: "",
    is_order_manager: false,
    is_ce_admin: false,
  };

  function normalizeRows(rows) {
    return rows.map((row) => ({
      ...row,
      dirty: false,
      password: "",
    }));
  }

  async function loadData() {
    status = null;
    isLoading = true;
    try {
      const [userRows, companyRows] = await Promise.all([
        listAdminUsers(),
        listCompanies(),
      ]);
      users = normalizeRows(userRows || []);
      companies = companyRows || [];
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load users.",
      };
    } finally {
      isLoading = false;
    }
  }

  onMount(loadData);

  function updateRow(index, field, value) {
    const next = [...users];
    next[index] = { ...next[index], [field]: value, dirty: true };
    users = next;
  }

  async function saveRow(user, index) {
    status = null;
    isSaving = true;
    try {
      await updateAdminUser(user.id, {
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        status: user.status,
        company_id: user.company_id || null,
        is_order_manager: user.is_order_manager ? 1 : 0,
        is_ce_admin: user.is_ce_admin ? 1 : 0,
        password: user.password || "",
      });
      const next = [...users];
      next[index] = { ...user, dirty: false, password: "" };
      users = next;
      status = { type: "success", message: "User saved." };
    } catch (error) {
      status = { type: "error", message: error.message || "Save failed." };
    } finally {
      isSaving = false;
    }
  }

  async function handleCreate() {
    status = null;
    if (!newUser.email || !newUser.password) {
      status = { type: "error", message: "Email and password are required." };
      return;
    }
    try {
      await createAdminUser({
        ...newUser,
        company_id: newUser.company_id || null,
        is_order_manager: newUser.is_order_manager ? 1 : 0,
        is_ce_admin: newUser.is_ce_admin ? 1 : 0,
      });
      newUser = {
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        phone: "",
        status: "active",
        company_id: "",
        is_order_manager: false,
        is_ce_admin: false,
      };
      showCreate = false;
      await loadData();
      status = { type: "success", message: "User created." };
    } catch (error) {
      status = { type: "error", message: error.message || "Create failed." };
    }
  }

  async function handleDelete(id) {
    status = null;
    if (!confirm("Delete this user?")) return;
    try {
      await deleteAdminUser(id);
      users = users.filter((u) => u.id !== id);
      status = { type: "success", message: "User deleted." };
    } catch (error) {
      status = { type: "error", message: error.message || "Delete failed." };
    }
  }

  function normalizeSearch(value) {
    return String(value || "")
      .toLowerCase()
      .trim();
  }

  $: companyById = new Map(
    companies.map((company) => [String(company.id), company.name]),
  );
  $: searchValue = normalizeSearch(search);
  $: filteredUsers = users.filter((user) => {
    if (statusFilter && user.status !== statusFilter) return false;
    if (companyFilter && String(user.company_id || "") !== companyFilter)
      return false;
    if (roleFilter) {
      if (roleFilter === "order_manager" && !user.is_order_manager)
        return false;
      if (roleFilter === "ce_admin" && !user.is_ce_admin) return false;
      if (roleFilter === "both" && !(user.is_order_manager && user.is_ce_admin))
        return false;
      if (roleFilter === "none" && (user.is_order_manager || user.is_ce_admin))
        return false;
    }
    if (!searchValue) return true;
    const email = normalizeSearch(user.email);
    const first = normalizeSearch(user.first_name);
    const last = normalizeSearch(user.last_name);
    const phone = normalizeSearch(user.phone);
    const companyName = normalizeSearch(
      companyById.get(String(user.company_id || "")),
    );
    return (
      email.includes(searchValue) ||
      first.includes(searchValue) ||
      last.includes(searchValue) ||
      phone.includes(searchValue) ||
      companyName.includes(searchValue)
    );
  });
</script>

<section>
  <div class="panel-header">
    <p class="hint">Create and manage users, roles, and company assignments.</p>
    <button on:click={() => (showCreate = true)}>+ Create user</button>
  </div>

  {#if status}
    <div class={`status ${status.type}`}>{status.message}</div>
  {/if}

  {#if showCreate}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={() => (showCreate = false)}>
      <div class="modal-content" on:click|stopPropagation>
        <h3>Create user</h3>
        <div class="form-grid">
          <label>Email<input type="text" bind:value={newUser.email} /></label>
          <label
            >Password<input type="text" bind:value={newUser.password} /></label
          >
          <label
            >First name<input
              type="text"
              bind:value={newUser.first_name}
            /></label
          >
          <label
            >Last name<input
              type="text"
              bind:value={newUser.last_name}
            /></label
          >
          <label>Phone<input type="text" bind:value={newUser.phone} /></label>
          <label
            >Status
            <select bind:value={newUser.status}>
              <option value="active">active</option>
              <option value="pending">pending</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label
            >Company
            <select bind:value={newUser.company_id}>
              <option value="">(none)</option>
              {#each companies as company}
                <option value={String(company.id)}>{company.name}</option>
              {/each}
            </select>
          </label>
          <label class="checkbox">
            <input type="checkbox" bind:checked={newUser.is_order_manager} />
            Order manager
          </label>
          <label class="checkbox">
            <input type="checkbox" bind:checked={newUser.is_ce_admin} />
            CE admin
          </label>
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
    <h3>Filter users</h3>
    <div class="form-grid">
      <label>
        Search
        <input
          type="text"
          placeholder="Email, name, phone, company"
          bind:value={search}
        />
      </label>
      <label>
        Status
        <select bind:value={statusFilter}>
          <option value="">(all)</option>
          <option value="active">active</option>
          <option value="pending">pending</option>
          <option value="disabled">disabled</option>
        </select>
      </label>
      <label>
        Company
        <select bind:value={companyFilter}>
          <option value="">(all)</option>
          {#each companies as company}
            <option value={String(company.id)}>{company.name}</option>
          {/each}
        </select>
      </label>
      <label>
        Role
        <select bind:value={roleFilter}>
          <option value="">(all)</option>
          <option value="order_manager">Order manager</option>
          <option value="ce_admin">CE admin</option>
          <option value="both">Both roles</option>
          <option value="none">No roles</option>
        </select>
      </label>
    </div>
  </div>

  <div class="card-list">
    {#if isLoading}
      <p>Loading...</p>
    {:else if filteredUsers.length === 0}
      <p class="empty">No users.</p>
    {:else}
      {#each filteredUsers as user, index}
        <div class="admin-card">
          <div class="admin-card__header">
            <div>
              <strong>{user.email}</strong>
              <span class="admin-card__meta"
                >{user.first_name} {user.last_name}</span
              >
            </div>
            <span
              class={`admin-badge ${
                user.status === "active"
                  ? "admin-badge--success"
                  : user.status === "pending"
                    ? "admin-badge--warning"
                    : "admin-badge--danger"
              }`}
            >
              {user.status}
            </span>
          </div>
          <div class="admin-card__grid admin-card__grid--users">
            <label>
              Email
              <input
                type="text"
                value={user.email}
                on:input={(e) => updateRow(index, "email", e.target.value)}
              />
            </label>
            <label>
              First name
              <input
                type="text"
                value={`${user.first_name || ""}`}
                on:input={(e) => updateRow(index, "first_name", e.target.value)}
              />
            </label>
            <label>
              Last name
              <input
                type="text"
                value={`${user.last_name || ""}`}
                on:input={(e) => updateRow(index, "last_name", e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                type="text"
                value={user.phone || ""}
                on:input={(e) => updateRow(index, "phone", e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={user.status}
                on:change={(e) => updateRow(index, "status", e.target.value)}
              >
                <option value="active">active</option>
                <option value="pending">pending</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
            <label>
              Company
              <select
                value={user.company_id ? String(user.company_id) : ""}
                on:change={(e) =>
                  updateRow(
                    index,
                    "company_id",
                    e.target.value ? Number(e.target.value) : "",
                  )}
              >
                <option value="">(none)</option>
                {#each companies as company}
                  <option value={String(company.id)}>{company.name}</option>
                {/each}
              </select>
            </label>
            <label>
              New password
              <input
                type="text"
                value={user.password || ""}
                on:input={(e) => updateRow(index, "password", e.target.value)}
                placeholder="Leave blank"
              />
            </label>
            <div class="admin-role">
              <span class="role-title">Roles</span>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={!!user.is_order_manager}
                  on:change={(e) =>
                    updateRow(index, "is_order_manager", e.target.checked)}
                />
                Order manager
              </label>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={!!user.is_ce_admin}
                  on:change={(e) =>
                    updateRow(index, "is_ce_admin", e.target.checked)}
                />
                CE admin
              </label>
            </div>
          </div>
          <div class="admin-card__actions">
            <button
              class="secondary"
              on:click={() => saveRow(user, index)}
              disabled={!user.dirty || isSaving}
            >
              Save
            </button>
            <button class="danger" on:click={() => handleDelete(user.id)}
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
