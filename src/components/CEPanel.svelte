<script>
  import { onMount } from "svelte";
  import { createCeApi, defaultCeBaseUrl } from "../lib/ceApi.js";
  import ProductPanel from "./ce/ProductPanel.svelte";
  import ModelPanel from "./ce/ModelPanel.svelte";

  let activeTab = "products";
  let api = createCeApi("");
  let toast = null;
  let toastTimer;

  function notify(type, text) {
    toast = { type, text };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, 3500);
  }

  onMount(() => {
    api = createCeApi(defaultCeBaseUrl());
  });
</script>

<div class="ce-panel">
  {#if toast}
    <div class={`ce-toast ${toast.type}`}>{toast.text}</div>
  {/if}

  <div class="panel-header">
    <div class="tab-bar">
      <button
        class={`tab ${activeTab === "products" ? "active" : ""}`}
        on:click={() => (activeTab = "products")}
      >
        Products
      </button>
      <button
        class={`tab ${activeTab === "models" ? "active" : ""}`}
        on:click={() => (activeTab = "models")}
      >
        Models
      </button>
    </div>
  </div>

  {#if activeTab === "products"}
    <ProductPanel {api} {notify} />
  {:else}
    <ModelPanel {api} {notify} />
  {/if}
</div>

<style>
  :global(.ce-panel) {
    display: grid;
    gap: 20px;
  }

  /* Re-using panel-header style logic from other components but scoping global for CE sub-panels */
  .panel-header {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 12px;
  }

  :global(.ce-panel .input) {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
    background: #fff;
    color: var(--ink);
    font-size: 14px;
    box-shadow: 0 8px 18px rgba(25, 22, 19, 0.08);
  }

  :global(.ce-panel .tab-bar) {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  :global(.ce-panel button.ghost) {
    background: #f7f3ea;
    color: var(--brand-dark);
    border: 1px solid var(--line);
  }

  :global(.ce-panel button.ghost:hover) {
    border-color: var(--brand);
  }

  :global(.ce-panel .table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 12px;
  }

  :global(.ce-panel .table th),
  :global(.ce-panel .table td) {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
  }

  :global(.ce-panel .form-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }

  :global(.ce-panel .field.wide) {
    grid-column: 1 / -1;
  }

  :global(.ce-panel .field label) {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 6px;
  }

  :global(.ce-panel textarea) {
    width: 100%;
    min-height: 90px;
    resize: vertical;
  }

  :global(.ce-panel select) {
    width: 100%;
  }

  :global(.ce-panel .input:focus) {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 10px 22px rgba(239, 125, 50, 0.16);
  }

  :global(.ce-panel .ce-toast) {
    position: sticky;
    top: 12px;
    align-self: start;
    padding: 10px 14px;
    border-radius: 12px;
    background: #f0f5f2;
    color: var(--brand-dark);
    border: 1px solid #cfe1d8;
    font-weight: 600;
    z-index: 5;
  }

  :global(.ce-panel .ce-toast.error) {
    background: #f7e9e7;
    border-color: #e3b9b2;
    color: var(--danger);
  }

  :global(.ce-panel .ce-toast.success) {
    background: #e8f3ee;
    border-color: #b9d8c7;
    color: var(--brand-dark);
  }

  :global(.ce-panel .card-header) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }

  :global(.ce-panel .card-title) {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 4px;
    color: var(--ink);
  }

  :global(.ce-panel .helper) {
    font-size: 14px;
    color: var(--muted);
    margin: 0;
  }

  :global(.ce-panel .stack) {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
