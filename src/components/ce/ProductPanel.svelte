<script>
  export let api;
  export let notify;

  let searchText = "";
  let searchResults = [];
  let newSerial = "";
  let isSearching = false;
  let isLoading = false;
  let isSaving = false;
  let isDeleting = false;
  let isApplyingModel = false;
  let product = null;
  let modelOptions = [];

  const blankProduct = {
    modell: "",
    serienummer: "",
    motornummer: "",
    tillverkningsar: "",
    godkand_av: "",
    maskinslag_ce: "",
    maskinslag: "",
    fabrikat: "",
    motorfabrikat: "",
    motoreffekt: "",
    motorvolym: "",
    uppfyller_avgaskrav: "",
    certifikat_nummer: "",
    rek_bransle: "",
    originalmotor: "",
    hyudralolja: "",
    harmoniserande_standarder: "",
    enligt_villkoren_i_direktiv: "",
    anmalt_organ_for_direktiv: "",
    uppmatt_ljudeffektniva: "",
    garanterad_ljud_och_effektniva: "",
    namn_och_underskrift: "",
    is_dynapac_ce: "0",
    maskin_marke: ""
  };

  const productFields = [
    { key: "modell", label: "Model", type: "select", source: "models" },
    {
      key: "is_dynapac_ce",
      label: "CE document type",
      type: "select",
      options: [
        { value: "0", label: "Swepac" },
        { value: "1", label: "Dynapac" }
      ]
    },
    { key: "maskin_marke", label: "Machine brand", type: "text" },
    { key: "serienummer", label: "Serial number", type: "text", readonly: true },
    { key: "motornummer", label: "Engine number", type: "text" },
    { key: "tillverkningsar", label: "Manufacture year", type: "text" },
    { key: "godkand_av", label: "Approved by", type: "text" },
    { key: "maskinslag_ce", label: "Machine type (CE)", type: "text" },
    { key: "maskinslag", label: "Machine type", type: "text" },
    { key: "fabrikat", label: "Brand", type: "text" },
    { key: "motorfabrikat", label: "Engine brand", type: "text" },
    { key: "motoreffekt", label: "Engine power", type: "text" },
    { key: "motorvolym", label: "Engine volume", type: "text" },
    { key: "uppfyller_avgaskrav", label: "Emission compliance", type: "text" },
    { key: "certifikat_nummer", label: "Certificate number", type: "text" },
    { key: "rek_bransle", label: "Recommended fuel", type: "text" },
    { key: "originalmotor", label: "Original engine", type: "text" },
    { key: "hyudralolja", label: "Hydraulic oil", type: "text" },
    {
      key: "harmoniserande_standarder",
      label: "Harmonized standards",
      type: "textarea"
    },
    {
      key: "enligt_villkoren_i_direktiv",
      label: "According to directive terms",
      type: "textarea"
    },
    {
      key: "anmalt_organ_for_direktiv",
      label: "Notified body for directive",
      type: "textarea"
    },
    { key: "uppmatt_ljudeffektniva", label: "Measured sound power", type: "text" },
    {
      key: "garanterad_ljud_och_effektniva",
      label: "Guaranteed sound power",
      type: "text"
    },
    { key: "namn_och_underskrift", label: "Name and signature", type: "text" }
  ];

  const modelToProductKeys = [
    "maskinslag_ce",
    "maskinslag",
    "fabrikat",
    "motorfabrikat",
    "motoreffekt",
    "motorvolym",
    "uppfyller_avgaskrav",
    "certifikat_nummer",
    "rek_bransle",
    "originalmotor",
    "hyudralolja",
    "harmoniserande_standarder",
    "enligt_villkoren_i_direktiv",
    "anmalt_organ_for_direktiv",
    "uppmatt_ljudeffektniva",
    "garanterad_ljud_och_effektniva",
    "namn_och_underskrift",
    "is_dynapac_ce",
    "maskin_marke"
  ];

  function isSuccess(result) {
    return result === true || result === "true" || result === 1;
  }

  function normalizeProduct(data) {
    const normalized = { ...blankProduct };
    if (!data) {
      return normalized;
    }
    Object.keys(normalized).forEach((key) => {
      const value = data[key];
      normalized[key] = value === null || value === undefined ? "" : String(value);
    });
    return normalized;
  }

  async function applyModelToProduct(name) {
    if (!product) {
      return;
    }
    const modelName = (name || "").trim();
    if (!modelName) {
      return;
    }
    isApplyingModel = true;
    try {
      const data = await api.getModel(modelName);
      if (!data) {
        notify("error", "Model could not be loaded.");
        return;
      }
      const next = { ...product, modell: modelName };
      modelToProductKeys.forEach((key) => {
        if (key in data) {
          next[key] = data[key] ?? "";
        }
      });
      product = normalizeProduct(next);
    } catch (error) {
      notify("error", error.message || "Could not apply model.");
    } finally {
      isApplyingModel = false;
    }
  }

  async function searchProducts() {
    if (!searchText.trim()) {
      notify("error", "Enter a serial number to search.");
      return;
    }
    isSearching = true;
    try {
      const results = await api.searchProducts(searchText.trim());
      searchResults = Array.isArray(results) ? results : [];
      if (!searchResults.length) {
        notify("error", "No products found.");
      }
    } catch (error) {
      notify("error", error.message || "Search failed.");
    } finally {
      isSearching = false;
    }
  }

  async function loadProduct(serial) {
    if (!serial) {
      return;
    }
    isLoading = true;
    try {
      const data = await api.getProduct(serial);
      const results = data?.databaseResults || [];
      if (!results.length) {
        notify("error", "Product not found.");
        return;
      }
      modelOptions = (data?.availableModelNames || []).slice().sort((a, b) => {
        const left = a.modellNamn || "";
        const right = b.modellNamn || "";
        return left.localeCompare(right);
      });
      product = normalizeProduct(results[0]);
    } catch (error) {
      notify("error", error.message || "Could not load product.");
    } finally {
      isLoading = false;
    }
  }

  async function createProduct() {
    const serial = newSerial.trim();
    if (!serial) {
      notify("error", "Enter a serial number to create.");
      return;
    }
    if (!/^\d+$/.test(serial)) {
      notify("error", "Serial number must be numeric.");
      return;
    }
    isLoading = true;
    try {
      const result = await api.createProduct(serial);
      if (!isSuccess(result)) {
        notify("error", "Product could not be created.");
        return;
      }
      newSerial = "";
      await loadProduct(serial);
      notify("success", "Product created.");
    } catch (error) {
      notify("error", error.message || "Create failed.");
    } finally {
      isLoading = false;
    }
  }

  async function saveProduct() {
    if (!product?.serienummer) {
      notify("error", "Load a product before saving.");
      return;
    }
    isSaving = true;
    try {
      const payload = {};
      Object.keys(blankProduct).forEach((key) => {
        payload[key] = product[key] ?? "";
      });
      payload.serienummer = product.serienummer;
      const result = await api.saveProduct(payload);
      if (!isSuccess(result)) {
        notify("error", "Save failed.");
        return;
      }
      notify("success", "Product saved.");
    } catch (error) {
      notify("error", error.message || "Save failed.");
    } finally {
      isSaving = false;
    }
  }

  async function deleteProduct() {
    if (!product?.serienummer) {
      return;
    }
    if (!confirm(`Delete product ${product.serienummer}?`)) {
      return;
    }
    isDeleting = true;
    try {
      const result = await api.deleteProduct(product.serienummer);
      if (!isSuccess(result)) {
        notify("error", "Delete failed.");
        return;
      }
      product = null;
      notify("success", "Product deleted.");
    } catch (error) {
      notify("error", error.message || "Delete failed.");
    } finally {
      isDeleting = false;
    }
  }
</script>

<div class="panel">
  <section class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Create product</h2>
        <div class="helper">Add a new serial number and jump straight into edit mode.</div>
      </div>
      <div class="stack">
        <input class="input" placeholder="Serial number" bind:value={newSerial} />
        <button class="secondary" on:click={createProduct} disabled={isLoading}>Create</button>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Find product</h2>
        <div class="helper">Search existing serial numbers and open the editor.</div>
      </div>
      <div class="stack">
        <input class="input" placeholder="Search serial number" bind:value={searchText} />
        <button class="ghost" on:click={searchProducts} disabled={isSearching}>Search</button>
      </div>
    </div>

    {#if searchResults.length}
      <table class="table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Serial</th>
            <th>Engine number</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each searchResults as row}
            <tr>
              <td>{row.modell}</td>
              <td>{row.serienummer}</td>
              <td>{row.motornummer}</td>
              <td>
                <button class="ghost" on:click={() => loadProduct(row.serienummer)}>Edit</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="helper">Search results will show here.</div>
    {/if}
  </section>

  <section class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Product editor</h2>
        <div class="helper">Save changes to regenerate PDFs automatically.</div>
      </div>
      <div class="stack">
        <button class="ghost" on:click={() => (product = null)} disabled={!product}>Clear</button>
        <button on:click={saveProduct} disabled={!product || isSaving}>Save</button>
        <button class="danger" on:click={deleteProduct} disabled={!product || isDeleting}>Delete</button>
      </div>
    </div>

    {#if isLoading}
      <div class="helper">Loading...</div>
    {:else if product}
      <form class="form-grid" on:submit|preventDefault={saveProduct}>
        {#each productFields as field}
          <div class={`field ${field.type === "textarea" ? "wide" : ""}`}>
            <label for={`product-${field.key}`}>{field.label}</label>
            {#if field.type === "textarea"}
              <textarea id={`product-${field.key}`} bind:value={product[field.key]}></textarea>
            {:else if field.type === "select"}
              <select
                id={`product-${field.key}`}
                bind:value={product[field.key]}
                disabled={field.readonly || isApplyingModel}
                on:change={(event) => {
                  if (field.source === "models") {
                    applyModelToProduct(event.target.value);
                  }
                }}
              >
                {#if field.source === "models"}
                  <option value="">Select model</option>
                  {#each modelOptions as option}
                    <option value={option.modellNamn}>{option.modellNamn}</option>
                  {/each}
                {:else}
                  {#each field.options as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                {/if}
              </select>
            {:else}
              <input
                id={`product-${field.key}`}
                class="input"
                type="text"
                bind:value={product[field.key]}
                readonly={field.readonly}
              />
            {/if}
          </div>
        {/each}
      </form>
    {:else}
      <div class="helper">Select a product to edit.</div>
    {/if}
  </section>
</div>
