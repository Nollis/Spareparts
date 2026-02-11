<script>
  import { onMount, tick } from "svelte";

  export let api;
  export let notify;

  let models = [];
  let filterText = "";
  let model = null;
  let newModelName = "";
  let isLoading = false;
  let isSaving = false;
  let isDeleting = false;
  let editorSection;

  const blankModel = {
    modellNamn: "",
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

  const modelFields = [
    { key: "modellNamn", label: "Model name", type: "text", readonly: true },
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

  function isSuccess(result) {
    return result === true || result === "true" || result === 1;
  }

  function normalizeModel(data) {
    const normalized = { ...blankModel };
    if (!data) {
      return normalized;
    }
    Object.keys(normalized).forEach((key) => {
      const value = data[key];
      normalized[key] = value === null || value === undefined ? "" : String(value);
    });
    return normalized;
  }

  async function loadModels() {
    isLoading = true;
    try {
      const result = await api.listModels();
      models = Array.isArray(result) ? result : [];
    } catch (error) {
      notify("error", error.message || "Could not load models.");
    } finally {
      isLoading = false;
    }
  }

  async function loadModel(name) {
    if (!name) {
      return;
    }
    isLoading = true;
    try {
      const data = await api.getModel(name);
      model = normalizeModel(data);
      await tick();
      editorSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      notify("error", error.message || "Could not load model.");
    } finally {
      isLoading = false;
    }
  }

  async function createModel() {
    const name = newModelName.trim();
    if (!name) {
      notify("error", "Enter a model name.");
      return;
    }
    isLoading = true;
    try {
      const result = await api.createModel(name);
      if (!isSuccess(result)) {
        notify("error", "Model could not be created.");
        return;
      }
      newModelName = "";
      await loadModel(name);
      await loadModels();
      notify("success", "Model created.");
    } catch (error) {
      notify("error", error.message || "Create failed.");
    } finally {
      isLoading = false;
    }
  }

  async function saveModel() {
    if (!model?.modellNamn) {
      notify("error", "Load a model before saving.");
      return;
    }
    isSaving = true;
    try {
      const payload = {};
      Object.keys(blankModel).forEach((key) => {
        payload[key] = model[key] ?? "";
      });
      payload.modellNamn = model.modellNamn;
      const result = await api.saveModel(payload);
      if (!isSuccess(result)) {
        notify("error", "Save failed.");
        return;
      }
      notify("success", "Model saved.");
    } catch (error) {
      notify("error", error.message || "Save failed.");
    } finally {
      isSaving = false;
    }
  }

  async function deleteModel() {
    if (!model?.modellNamn) {
      return;
    }
    if (!confirm(`Delete model ${model.modellNamn}?`)) {
      return;
    }
    isDeleting = true;
    try {
      const result = await api.deleteModel(model.modellNamn);
      if (!isSuccess(result)) {
        notify("error", "Delete failed.");
        return;
      }
      model = null;
      await loadModels();
      notify("success", "Model deleted.");
    } catch (error) {
      notify("error", error.message || "Delete failed.");
    } finally {
      isDeleting = false;
    }
  }

  $: filteredModels = models
    .filter((item) => item.modellNamn?.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => (a.modellNamn || "").localeCompare(b.modellNamn || ""));

  onMount(loadModels);
</script>

<div class="panel">
  <section class="card" bind:this={editorSection}>
    <div class="card-header">
      <div>
        <h2 class="card-title">Create model</h2>
        <div class="helper">Register a new model and open it immediately.</div>
      </div>
      <div class="stack">
        <input class="input" placeholder="Model name" bind:value={newModelName} />
        <button class="secondary" on:click={createModel} disabled={isLoading}>Create</button>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Model library</h2>
        <div class="helper">Browse or filter all registered models.</div>
      </div>
      <div class="stack">
        <input class="input" placeholder="Filter models" bind:value={filterText} />
        <button class="ghost" on:click={loadModels} disabled={isLoading}>Refresh</button>
      </div>
    </div>

    {#if isLoading}
      <div class="helper">Loading...</div>
    {:else if filteredModels.length}
      <table class="table">
        <thead>
          <tr>
            <th>Model</th>
            <th>CE search</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each filteredModels as row}
            <tr>
              <td>{row.modellNamn}</td>
              <td>{row.created_for_ce_search === "1" ? "Yes" : ""}</td>
              <td>
                <button class="ghost" on:click={() => loadModel(row.modellNamn)}>Edit</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="helper">No models found.</div>
    {/if}
  </section>

  <section class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Model editor</h2>
        <div class="helper">Changes apply to all products using the model.</div>
      </div>
      <div class="stack">
        <button class="ghost" on:click={() => (model = null)} disabled={!model}>Clear</button>
        <button on:click={saveModel} disabled={!model || isSaving}>Save</button>
        <button class="danger" on:click={deleteModel} disabled={!model || isDeleting}>Delete</button>
      </div>
    </div>

    {#if model}
      <form class="form-grid" on:submit|preventDefault={saveModel}>
        {#each modelFields as field}
          <div class={`field ${field.type === "textarea" ? "wide" : ""}`}>
            <label for={`model-${field.key}`}>{field.label}</label>
            {#if field.type === "textarea"}
              <textarea id={`model-${field.key}`} bind:value={model[field.key]}></textarea>
            {:else if field.type === "select"}
              <select id={`model-${field.key}`} bind:value={model[field.key]} disabled={field.readonly}>
                {#each field.options as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            {:else}
              <input
                id={`model-${field.key}`}
                class="input"
                type="text"
                bind:value={model[field.key]}
                readonly={field.readonly}
              />
            {/if}
          </div>
        {/each}
      </form>
    {:else}
      <div class="helper">Select a model to edit.</div>
    {/if}
  </section>
</div>
