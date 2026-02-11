<script>
  import { importProducts } from "../lib/api.js";

  let csvFile;
  let zipFile;
  let catalogFile;
  let status = null;
  let isSubmitting = false;

  async function handleImport() {
    status = null;
    if (!csvFile) {
      status = { type: "error", message: "Choose a CSV file first." };
      return;
    }
    isSubmitting = true;
    try {
      const formData = new FormData();
      formData.append("csv", csvFile);
      if (zipFile) {
        formData.append("zip", zipFile);
      }
      if (catalogFile) {
        formData.append("catalog", catalogFile);
      }
      const result = await importProducts(formData);
      status = { type: "success", message: "Import complete.", result };
    } catch (error) {
      status = { type: "error", message: error.message || "Import failed." };
    } finally {
      isSubmitting = false;
    }
  }
</script>

<section class="card">
  <p>
    Load the CSV and optional images ZIP. Catalog image is only used for the
    main product.
  </p>

  <div class="field">
    <label for="import-csv">CSV file (required)</label>
    <input
      id="import-csv"
      type="file"
      accept=".csv"
      on:change={(e) => (csvFile = e.target.files[0])}
    />
  </div>

  <div class="field">
    <label for="import-zip">Images ZIP (optional)</label>
    <input
      id="import-zip"
      type="file"
      accept=".zip"
      on:change={(e) => (zipFile = e.target.files[0])}
    />
  </div>

  <div class="field">
    <label for="import-catalog">Catalog image (optional)</label>
    <input
      id="import-catalog"
      type="file"
      accept="image/*"
      on:change={(e) => (catalogFile = e.target.files[0])}
    />
  </div>

  <div class="inline">
    <button on:click={handleImport} disabled={isSubmitting}>
      {isSubmitting ? "Importing..." : "Import"}
    </button>
  </div>
  <p style="margin-top: 8px; color: var(--muted); font-size: 12px;">
    Import adds new rows and updates existing ones. Product-to-category links
    are replaced for SKUs in the CSV.
  </p>

  {#if status}
    <div class="status">
      <strong>{status.type === "error" ? "Error" : "Success"}:</strong>
      {status.message}
      {#if status.result}
        <div style="margin-top: 8px;">
          Imported: {status.result.categories} categories, {status.result
            .products} products.
        </div>
        <div>Images: {status.result.images} files.</div>
        <div>Main keys: {status.result.mainKeys?.join(", ")}</div>
        {#if status.result.created || status.result.updated}
          <div style="margin-top: 8px;">
            Created: {status.result.created?.categories || 0} categories, {status
              .result.created?.products || 0} products.
          </div>
          <div>
            Updated: {status.result.updated?.categories || 0} categories, {status
              .result.updated?.products || 0} products.
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>
