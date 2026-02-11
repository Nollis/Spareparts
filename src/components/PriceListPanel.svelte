<script>
  import { onMount } from "svelte";
  import {
    getPriceSettings,
    importPricelist,
    savePriceSettings,
  } from "../lib/api.js";

  let csvFile;
  let status = null;
  let isSubmitting = false;
  let baseCurrency = "SEK";
  let currencies = [{ code: "SEK", name: "Swedish krona", rate: 1 }];
  let currencyStatus = null;
  let isSaving = false;

  onMount(async () => {
    try {
      const settings = await getPriceSettings();
      if (settings?.baseCurrency) {
        baseCurrency = settings.baseCurrency;
      }
      if (Array.isArray(settings?.currencies) && settings.currencies.length) {
        currencies = settings.currencies;
      }
    } catch (error) {
      currencyStatus = {
        type: "error",
        message: error.message || "Could not load currency settings.",
      };
    }
  });

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
      const result = await importPricelist(formData);
      status = { type: "success", message: "Price list updated.", result };
    } catch (error) {
      status = { type: "error", message: error.message || "Import failed." };
    } finally {
      isSubmitting = false;
    }
  }

  function addCurrency() {
    currencies = [...currencies, { code: "", name: "", rate: "" }];
  }

  function removeCurrency(index) {
    currencies = currencies.filter((_, i) => i !== index);
  }

  async function handleSaveSettings() {
    currencyStatus = null;
    isSaving = true;
    try {
      const payload = { baseCurrency, currencies };
      const result = await savePriceSettings(payload);
      baseCurrency = result.baseCurrency;
      currencies = result.currencies;
      currencyStatus = { type: "success", message: "Currency settings saved." };
    } catch (error) {
      currencyStatus = {
        type: "error",
        message: error.message || "Save failed.",
      };
    } finally {
      isSaving = false;
    }
  }
</script>

<section class="card">
  <h3>Import price list</h3>
  <p>Updates product prices by SKU from a price list CSV.</p>

  <div class="field">
    <label for="price-csv">Price list CSV</label>
    <input
      id="price-csv"
      type="file"
      accept=".csv"
      on:change={(e) => (csvFile = e.target.files[0])}
    />
  </div>

  <button on:click={handleImport} disabled={isSubmitting}>
    {isSubmitting ? "Updating..." : "Update prices"}
  </button>

  {#if status}
    <div class="status">
      <strong>{status.type === "error" ? "Error" : "Success"}:</strong>
      {status.message}
      {#if status.result}
        <div style="margin-top: 8px;">
          Updated: {status.result.updated} items. Missing: {status.result
            .missing}.
        </div>
      {/if}
    </div>
  {/if}
</section>

<section class="card">
  <h3>Currency settings</h3>
  <p>
    Store the currencies used by the frontend and the base currency for pricing.
  </p>

  <div class="field">
    <label for="base-currency">Base currency code</label>
    <input
      id="base-currency"
      type="text"
      placeholder="SEK"
      bind:value={baseCurrency}
    />
  </div>

  <div class="currency-grid">
    <div class="currency-header">Code</div>
    <div class="currency-header">Name</div>
    <div class="currency-header">Rate</div>
    <div class="currency-header"></div>
    {#each currencies as item, index}
      <div class="currency-row">
        <input type="text" bind:value={item.code} placeholder="SEK" />
        <input type="text" bind:value={item.name} placeholder="Swedish krona" />
        <input type="text" bind:value={item.rate} placeholder="1" />
        <button
          class="secondary"
          type="button"
          on:click={() => removeCurrency(index)}>Remove</button
        >
      </div>
    {/each}
  </div>

  <div class="inline" style="margin-top: 12px;">
    <button class="secondary" type="button" on:click={addCurrency}
      >Add currency</button
    >
    <button type="button" on:click={handleSaveSettings} disabled={isSaving}>
      {isSaving ? "Saving..." : "Save settings"}
    </button>
  </div>

  {#if currencyStatus}
    <div class="status">
      <strong>{currencyStatus.type === "error" ? "Error" : "Success"}:</strong>
      {currencyStatus.message}
    </div>
  {/if}
</section>

<style>
  h3 {
    margin-top: 0;
  }
  .currency-grid {
    display: grid;
    grid-template-columns: 120px 1fr 120px auto;
    gap: 8px;
    align-items: center;
  }

  .currency-header {
    font-size: 12px;
    color: var(--muted);
  }

  .currency-row {
    display: contents;
  }

  .currency-row input {
    width: 100%;
  }
</style>
