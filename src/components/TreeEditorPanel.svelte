<script>
  import { onMount } from "svelte";
  import {
    addProductCategory,
    createCategory,
    createProduct,
    deleteCategory,
    deleteProduct,
    listCategories,
    listProducts,
    removeProductCategory,
    updateCategories,
    updateProducts,
  } from "../lib/api.js";

  export let mode = "both";

  let categoryQuery = "";
  let categoryLimit = 200;
  let categories = [];
  let categoryStatus = null;
  let isCategoryLoading = false;
  let isCategorySaving = false;
  let showCreateCategory = false;
  let newCategory = {
    path: "",
    name_sv: "",
    name_en: "",
    desc_sv: "",
    desc_en: "",
    position: "",
    is_main: false,
  };

  let productQuery = "";
  let productLimit = 200;
  let products = [];
  let productStatus = null;
  let isProductLoading = false;
  let isProductSaving = false;
  let showCreateProduct = false;
  let categorySuggestions = [];

  let newProduct = {
    sku: "",
    name_sv: "",
    name_en: "",
    desc_sv: "",
    desc_en: "",
    pos_num: "",
    no_units: "",
    price: "",
  };

  onMount(async () => {
    await loadCategorySuggestions();
  });

  function normalizeCategoryRows(items) {
    return items.map((item) => ({ ...item, dirty: false }));
  }

  function normalizeProductRows(items) {
    return items.map((item) => ({
      ...item,
      dirty: false,
      categoryInput: "",
    }));
  }

  async function loadCategorySuggestions() {
    try {
      const items = await listCategories({ query: "", limit: 500 });
      categorySuggestions = items.map((item) => item.key);
    } catch (error) {
      categorySuggestions = [];
    }
  }

  async function loadCategories() {
    categoryStatus = null;
    isCategoryLoading = true;
    try {
      const items = await listCategories({
        query: categoryQuery,
        limit: categoryLimit,
      });
      categories = normalizeCategoryRows(items);
      if (!categories.length) {
        categoryStatus = { type: "info", message: "No categories found." };
      }
    } catch (error) {
      categoryStatus = {
        type: "error",
        message: error.message || "Could not load categories.",
      };
    } finally {
      isCategoryLoading = false;
    }
  }

  function updateCategoryField(index, field, value) {
    const next = [...categories];
    next[index] = { ...next[index], [field]: value, dirty: true };
    categories = next;
  }

  async function saveCategoryChanges() {
    const dirtyItems = categories.filter((item) => item.dirty);
    if (!dirtyItems.length) {
      categoryStatus = { type: "info", message: "No pending changes." };
      return;
    }
    categoryStatus = null;
    isCategorySaving = true;
    try {
      await updateCategories({ items: dirtyItems });
      categories = categories.map((item) => ({ ...item, dirty: false }));
      categoryStatus = {
        type: "success",
        message: `Saved ${dirtyItems.length} categories.`,
      };
    } catch (error) {
      categoryStatus = {
        type: "error",
        message: error.message || "Save failed.",
      };
    } finally {
      isCategorySaving = false;
    }
  }

  async function handleCreateCategory() {
    categoryStatus = null;
    if (!newCategory.path) {
      const fallback = newCategory.name_sv || newCategory.name_en;
      if (fallback) {
        newCategory = { ...newCategory, path: fallback };
      }
    }
    if (!newCategory.path) {
      categoryStatus = { type: "error", message: "Category name is required." };
      return;
    }
    try {
      await createCategory(newCategory);
      newCategory = {
        path: "",
        name_sv: "",
        name_en: "",
        desc_sv: "",
        desc_en: "",
        position: "",
        is_main: false,
      };
      showCreateCategory = false;
      await loadCategories();
      await loadCategorySuggestions();
      categoryStatus = { type: "success", message: "Category created." };
    } catch (error) {
      categoryStatus = {
        type: "error",
        message: error.message || "Create failed.",
      };
    }
  }

  async function handleDeleteCategory(key) {
    categoryStatus = null;
    if (!window.confirm("Delete this category?")) {
      return;
    }
    try {
      await deleteCategory(key, { cascade: true });
      await loadCategories();
      await loadCategorySuggestions();
    } catch (error) {
      categoryStatus = {
        type: "error",
        message: error.message || "Delete failed.",
      };
    }
  }

  async function loadProducts() {
    productStatus = null;
    isProductLoading = true;
    try {
      const items = await listProducts({
        query: productQuery,
        limit: productLimit,
      });
      products = normalizeProductRows(items);
      if (!products.length) {
        productStatus = { type: "info", message: "No products found." };
      }
    } catch (error) {
      productStatus = {
        type: "error",
        message: error.message || "Could not load products.",
      };
    } finally {
      isProductLoading = false;
    }
  }

  function updateProductField(index, field, value) {
    const next = [...products];
    const markDirty = field !== "categoryInput";
    next[index] = {
      ...next[index],
      [field]: value,
      dirty: markDirty ? true : next[index].dirty,
    };
    products = next;
  }

  async function saveProductChanges() {
    const dirtyItems = products.filter((item) => item.dirty);
    if (!dirtyItems.length) {
      productStatus = { type: "info", message: "No pending changes." };
      return;
    }
    productStatus = null;
    isProductSaving = true;
    try {
      await updateProducts({ items: dirtyItems });
      products = products.map((item) => ({ ...item, dirty: false }));
      productStatus = {
        type: "success",
        message: `Saved ${dirtyItems.length} products.`,
      };
    } catch (error) {
      productStatus = {
        type: "error",
        message: error.message || "Save failed.",
      };
    } finally {
      isProductSaving = false;
    }
  }

  async function handleCreateProduct() {
    productStatus = null;
    if (!newProduct.sku) {
      productStatus = { type: "error", message: "SKU is required." };
      return;
    }
    try {
      await createProduct(newProduct);
      newProduct = {
        sku: "",
        name_sv: "",
        name_en: "",
        desc_sv: "",
        desc_en: "",
        pos_num: "",
        no_units: "",
        price: "",
      };
      showCreateProduct = false;
      await loadProducts();
      productStatus = { type: "success", message: "Product created." };
    } catch (error) {
      productStatus = {
        type: "error",
        message: error.message || "Create failed.",
      };
    }
  }

  async function handleDeleteProduct(sku) {
    productStatus = null;
    if (!window.confirm("Delete this product?")) {
      return;
    }
    try {
      await deleteProduct(sku);
      await loadProducts();
    } catch (error) {
      productStatus = {
        type: "error",
        message: error.message || "Delete failed.",
      };
    }
  }

  async function handleAddCategory(sku, index) {
    const key = products[index]?.categoryInput?.trim();
    if (!key) {
      return;
    }
    productStatus = null;
    try {
      await addProductCategory(sku, key);
      const next = [...products];
      const existing = next[index].categories || [];
      if (!existing.includes(key)) {
        next[index].categories = [...existing, key];
      }
      next[index].categoryInput = "";
      products = next;
    } catch (error) {
      productStatus = {
        type: "error",
        message: error.message || "Add category failed.",
      };
    }
  }

  async function handleRemoveCategory(sku, categoryKey, index) {
    productStatus = null;
    try {
      await removeProductCategory(sku, categoryKey);
      const next = [...products];
      next[index].categories = (next[index].categories || []).filter(
        (item) => item !== categoryKey,
      );
      products = next;
    } catch (error) {
      productStatus = {
        type: "error",
        message: error.message || "Remove category failed.",
      };
    }
  }
</script>

{#if mode !== "products"}
  <section class="card">
    <div class="panel-header">
      <p class="hint">Edit category names and structure details.</p>
      <button on:click={() => (showCreateCategory = true)}
        >+ Create category</button
      >
    </div>

    <div class="panel-card no-shadow">
      <div class="inline">
        <label class="inline">
          <span style="margin-right: 8px;">Search</span>
          <input
            type="text"
            placeholder="Key, name"
            bind:value={categoryQuery}
          />
        </label>
        <label class="inline">
          <span style="margin-right: 8px;">Limit</span>
          <input type="text" style="width: 80px;" bind:value={categoryLimit} />
        </label>
        <button
          type="button"
          on:click={loadCategories}
          disabled={isCategoryLoading}
        >
          {isCategoryLoading ? "Loading..." : "Load"}
        </button>
        <button
          class="secondary"
          type="button"
          on:click={saveCategoryChanges}
          disabled={isCategorySaving}
        >
          {isCategorySaving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>

    {#if categoryStatus}
      <div class="status">
        <strong>{categoryStatus.type === "error" ? "Error" : "Status"}:</strong>
        {categoryStatus.message}
      </div>
    {/if}

    {#if showCreateCategory}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="modal-backdrop" on:click={() => (showCreateCategory = false)}>
        <div class="modal-content" on:click|stopPropagation>
          <h3>Add new category</h3>
          <div class="form-grid">
            <label
              >Name SV<input
                type="text"
                bind:value={newCategory.name_sv}
              /></label
            >
            <label
              >Name EN<input
                type="text"
                bind:value={newCategory.name_en}
              /></label
            >
            <label
              >Position<input
                type="text"
                bind:value={newCategory.position}
              /></label
            >
            <label class="inline">
              <input type="checkbox" bind:checked={newCategory.is_main} />
              <span style="margin-left: 6px;">Main product</span>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" on:click={handleCreateCategory}>Add</button>
            <button
              class="secondary"
              on:click={() => (showCreateCategory = false)}>Cancel</button
            >
          </div>
        </div>
      </div>
    {/if}
  </section>

  {#if categories.length}
    <section class="panel">
      {#each categories as item, index}
        <div class={`tree-row ${item.dirty ? "dirty" : ""}`}>
          <div class="tree-meta">
            <div class="tree-title">{item.key}</div>
            {#if item.parent_key}
              <div class="tree-sub">Parent: {item.parent_key}</div>
            {/if}
          </div>
          <div class="tree-fields">
            <div class="field-block">
              <div class="field-label">Name (SV)</div>
              <div class="field-help">
                Displayed in the catalog for Swedish.
              </div>
              <input
                type="text"
                placeholder="Name in Swedish"
                value={item.name_sv || ""}
                on:input={(event) =>
                  updateCategoryField(index, "name_sv", event.target.value)}
              />
            </div>
            <div class="field-block">
              <div class="field-label">Name (EN)</div>
              <div class="field-help">
                Displayed in the catalog for English.
              </div>
              <input
                type="text"
                placeholder="Name in English"
                value={item.name_en || ""}
                on:input={(event) =>
                  updateCategoryField(index, "name_en", event.target.value)}
              />
            </div>
            <div class="field-block">
              <div class="field-label">Description (SV)</div>
              <div class="field-help">Optional text for the category page.</div>
              <textarea
                rows="2"
                placeholder="Description in Swedish"
                value={item.desc_sv || ""}
                on:input={(event) =>
                  updateCategoryField(index, "desc_sv", event.target.value)}
              ></textarea>
            </div>
            <div class="field-block">
              <div class="field-label">Description (EN)</div>
              <div class="field-help">Optional text for the category page.</div>
              <textarea
                rows="2"
                placeholder="Description in English"
                value={item.desc_en || ""}
                on:input={(event) =>
                  updateCategoryField(index, "desc_en", event.target.value)}
              ></textarea>
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
                    updateCategoryField(index, "position", event.target.value)}
                />
              </div>
              <label class="inline">
                <input
                  type="checkbox"
                  checked={item.is_main === 1}
                  on:change={(event) =>
                    updateCategoryField(index, "is_main", event.target.checked)}
                />
                <span style="margin-left: 6px;">Main product</span>
              </label>
              <button
                class="danger"
                type="button"
                on:click={() => handleDeleteCategory(item.key)}>Delete</button
              >
            </div>
          </div>
        </div>
      {/each}
    </section>
  {/if}
{/if}

{#if mode !== "categories"}
  <section class="card">
    <div class="panel-header">
      <p class="hint">Edit product details and assign categories.</p>
      <button on:click={() => (showCreateProduct = true)}
        >+ Create product</button
      >
    </div>

    <div class="panel-card no-shadow">
      <div class="inline">
        <label class="inline">
          <span style="margin-right: 8px;">Search</span>
          <input
            type="text"
            placeholder="SKU or name"
            bind:value={productQuery}
          />
        </label>
        <label class="inline">
          <span style="margin-right: 8px;">Limit</span>
          <input type="text" style="width: 80px;" bind:value={productLimit} />
        </label>
        <button
          type="button"
          on:click={loadProducts}
          disabled={isProductLoading}
        >
          {isProductLoading ? "Loading..." : "Load"}
        </button>
        <button
          class="secondary"
          type="button"
          on:click={saveProductChanges}
          disabled={isProductSaving}
        >
          {isProductSaving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>

    {#if productStatus}
      <div class="status">
        <strong>{productStatus.type === "error" ? "Error" : "Status"}:</strong>
        {productStatus.message}
      </div>
    {/if}

    {#if showCreateProduct}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="modal-backdrop" on:click={() => (showCreateProduct = false)}>
        <div class="modal-content" on:click|stopPropagation>
          <h3>Add new product</h3>
          <div class="form-grid">
            <label>SKU<input type="text" bind:value={newProduct.sku} /></label>
            <label
              >Name SV<input
                type="text"
                bind:value={newProduct.name_sv}
              /></label
            >
            <label
              >Name EN<input
                type="text"
                bind:value={newProduct.name_en}
              /></label
            >
            <label
              >Price<input type="text" bind:value={newProduct.price} /></label
            >
          </div>
          <div class="modal-actions">
            <button type="button" on:click={handleCreateProduct}>Add</button>
            <button
              class="secondary"
              on:click={() => (showCreateProduct = false)}>Cancel</button
            >
          </div>
        </div>
      </div>
    {/if}
  </section>

  {#if products.length}
    <section class="panel">
      {#each products as item, index}
        <div class={`tree-row ${item.dirty ? "dirty" : ""}`}>
          <div class="tree-meta">
            <div class="tree-title">SKU: {item.sku}</div>
          </div>
          <div class="tree-fields">
            <div class="field-block">
              <div class="field-label">Name (SV)</div>
              <div class="field-help">Primary Swedish product name.</div>
              <input
                type="text"
                placeholder="Name in Swedish"
                value={item.name_sv || ""}
                on:input={(event) =>
                  updateProductField(index, "name_sv", event.target.value)}
              />
            </div>
            <div class="field-block">
              <div class="field-label">Name (EN)</div>
              <div class="field-help">Primary English product name.</div>
              <input
                type="text"
                placeholder="Name in English"
                value={item.name_en || ""}
                on:input={(event) =>
                  updateProductField(index, "name_en", event.target.value)}
              />
            </div>
            <div class="field-block">
              <div class="field-label">Description (SV)</div>
              <div class="field-help">
                Optional details shown in product view.
              </div>
              <textarea
                rows="2"
                placeholder="Description in Swedish"
                value={item.desc_sv || ""}
                on:input={(event) =>
                  updateProductField(index, "desc_sv", event.target.value)}
              ></textarea>
            </div>
            <div class="field-block">
              <div class="field-label">Description (EN)</div>
              <div class="field-help">
                Optional details shown in product view.
              </div>
              <textarea
                rows="2"
                placeholder="Description in English"
                value={item.desc_en || ""}
                on:input={(event) =>
                  updateProductField(index, "desc_en", event.target.value)}
              ></textarea>
            </div>
            <div class="inline">
              <div class="field-block compact">
                <div class="field-label">Position</div>
                <div class="field-help">Lower number sorts first.</div>
                <input
                  type="text"
                  style="width: 120px;"
                  placeholder="Order"
                  value={item.pos_num || ""}
                  on:input={(event) =>
                    updateProductField(index, "pos_num", event.target.value)}
                />
              </div>
              <div class="field-block compact">
                <div class="field-label">Units</div>
                <div class="field-help">Shown for kit quantities.</div>
                <input
                  type="text"
                  style="width: 120px;"
                  placeholder="Units"
                  value={item.no_units || ""}
                  on:input={(event) =>
                    updateProductField(index, "no_units", event.target.value)}
                />
              </div>
              <div class="field-block compact">
                <div class="field-label">Price</div>
                <div class="field-help">Overrides price list import.</div>
                <input
                  type="text"
                  style="width: 120px;"
                  placeholder="Price"
                  value={item.price || ""}
                  on:input={(event) =>
                    updateProductField(index, "price", event.target.value)}
                />
              </div>
              <button
                class="danger"
                type="button"
                on:click={() => handleDeleteProduct(item.sku)}>Delete</button
              >
            </div>
            <div class="category-tags">
              {#each item.categories || [] as cat}
                <span class="tag">
                  {cat}
                  <button
                    type="button"
                    on:click={() => handleRemoveCategory(item.sku, cat, index)}
                    >x</button
                  >
                </span>
              {/each}
            </div>
            <div class="inline">
              <input
                list="category-keys"
                type="text"
                placeholder="Add category key"
                value={item.categoryInput}
                on:input={(event) =>
                  updateProductField(
                    index,
                    "categoryInput",
                    event.target.value,
                  )}
              />
              <button
                type="button"
                class="secondary"
                on:click={() => handleAddCategory(item.sku, index)}
              >
                Add category
              </button>
            </div>
          </div>
        </div>
      {/each}
    </section>
  {/if}
{/if}

{#if mode !== "categories"}
  <datalist id="category-keys">
    {#each categorySuggestions as key}
      <option value={key}></option>
    {/each}
  </datalist>
{/if}

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

  .panel-card.no-shadow {
    box-shadow: none;
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
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
  }

  .tree-sub {
    font-size: 12px;
    color: var(--muted);
  }

  .tree-fields {
    display: grid;
    gap: 10px;
  }

  .tree-fields textarea {
    resize: vertical;
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

  .tag button {
    border: none;
    background: transparent;
    color: var(--muted);
    font-weight: 700;
    cursor: pointer;
    padding: 0 4px;
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
