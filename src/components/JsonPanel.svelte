<script>
  import { onMount } from "svelte";
  import { generateJson, listMainProducts } from "../lib/api.js";

  let mainProducts = [];
  let selectedKey = "";
  let status = null;
  let isSubmitting = false;

  // Progress state
  let progress = 0;
  let totalWork = 0;
  let currentFile = "";

  onMount(async () => {
    try {
      mainProducts = await listMainProducts();
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Could not load main products.",
      };
    }
  });

  async function handleGenerate() {
    status = null;
    isSubmitting = true;
    progress = 0;
    currentFile = "Initializing...";

    let generatedFilesCount = 0;
    const resultDetails = { outputDir: "", files: [] };

    try {
      // Case 1: Specific product selected
      if (selectedKey) {
        totalWork = 1;
        currentFile = `Generating for ${selectedKey}...`;
        const result = await generateJson({ mainKey: selectedKey });

        generatedFilesCount = result.files?.length || 0;
        resultDetails.outputDir = result.outputDir;
        progress = 1;
      }
      // Case 2: Generate All (Iterative)
      else {
        // Total = main products + 1 global step
        totalWork = mainProducts.length + 1;

        // 1. Iterate through all main products
        for (let i = 0; i < mainProducts.length; i++) {
          const product = mainProducts[i];
          currentFile = `Processing ${product.name} (${i + 1}/${mainProducts.length})...`;

          const result = await generateJson({
            mainKey: product.key,
            skipGlobal: true,
          });

          if (result.files) {
            generatedFilesCount += result.files.length;
            if (!resultDetails.outputDir)
              resultDetails.outputDir = result.outputDir;
          }

          progress = i + 1;
        }

        // 2. Generate global files
        currentFile = "Finalizing global files...";
        const globalResult = await generateJson({ onlyGlobal: true });
        if (globalResult.files) {
          generatedFilesCount += globalResult.files.length;
        }
        progress += 1;
      }

      status = {
        type: "success",
        message: "JSON generation complete.",
        result: {
          outputDir: resultDetails.outputDir,
          files: { length: generatedFilesCount },
        },
      };
    } catch (error) {
      status = {
        type: "error",
        message: error.message || "Generation failed.",
      };
    } finally {
      isSubmitting = false;
      currentFile = "";
    }
  }
</script>

<section class="card">
  <div class="field">
    <label for="json-generate-for">Generate for</label>
    <select id="json-generate-for" bind:value={selectedKey}>
      <option value="">All main products</option>
      {#each mainProducts as item}
        <option value={item.key}>{item.name} ({item.key})</option>
      {/each}
    </select>
  </div>

  {#if isSubmitting}
    <div class="progress-container">
      <progress value={progress} max={totalWork}></progress>
      <div class="progress-label">{currentFile}</div>
    </div>
  {/if}

  <button on:click={handleGenerate} disabled={isSubmitting}>
    {isSubmitting ? "Processing..." : "Generate"}
  </button>

  {#if status}
    <div class="status">
      <strong>{status.type === "error" ? "Error" : "Success"}:</strong>
      {status.message}
      {#if status.result}
        <div style="margin-top: 8px;">Output: {status.result.outputDir}</div>
        <div>Total Files Generated: {status.result.files?.length}</div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .progress-container {
    margin-top: 1rem;
    margin-bottom: 1rem;
  }
  progress {
    width: 100%;
    height: 20px;
  }
  .progress-label {
    font-size: 0.9em;
    color: #666;
    margin-top: 4px;
    font-style: italic;
  }
</style>
