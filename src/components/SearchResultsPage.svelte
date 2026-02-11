<script>
  import { onMount } from "svelte";
  import { searchArticles } from "../lib/public-api.js";

  export let language = "se";

  let query = "";
  let results = [];
  let loading = false;
  let error = "";

  const copy = {
    se: {
      title: "S&#246;kresultat f&#246;r:",
      category: "Kategori",
      sku: "Artikel.nr",
      name: "Ben&#228;mning",
      empty: "Inga tr&#228;ffar.",
    },
    en: {
      title: "Search results for:",
      category: "Category",
      sku: "SKU",
      name: "Name",
      empty: "No results.",
    },
    pl: {
      title: "Wyniki wyszukiwania:",
      category: "Kategoria",
      sku: "SKU",
      name: "Nazwa",
      empty: "Brak wynik&#243;w.",
    },
  };

  $: t = copy[language] || copy.se;

  function readQuery() {
    const params = new URLSearchParams(window.location.search || "");
    query = params.get("query") || "";
  }

  async function load() {
    if (!query) {
      results = [];
      return;
    }
    loading = true;
    error = "";
    try {
      results = await searchArticles(query, 50, language);
    } catch (e) {
      error = e?.message || "Search failed.";
      results = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    readQuery();
    load();
    const onPop = () => {
      readQuery();
      load();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });
</script>

<section class="search-page">
  <div class="container">
    <h1>{@html t.title} <strong>{query}</strong></h1>

    {#if loading}
      <p class="muted">Loading...</p>
    {:else if error}
      <p class="muted">{error}</p>
    {:else if results.length === 0}
      <p class="muted">{@html t.empty}</p>
    {:else}
      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th>{@html t.category}</th>
              <th>{@html t.sku}</th>
              <th>{@html t.name}</th>
            </tr>
          </thead>
          <tbody>
            {#each results as row}
              <tr>
                <td>
                  {#if row.category_key}
                    <a href={`/category/${row.category_key}`}>{row.category}</a>
                  {:else}
                    {row.category}
                  {/if}
                </td>
                <td>{row.sku}</td>
                <td>{row.name}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</section>

<style>
  .search-page {
    padding: 30px 0 80px;
    background: #f4f7f9;
  }

  .container {
    width: min(1100px, 92vw);
    margin: 0 auto;
  }

  h1 {
    margin: 0 0 16px;
  }

  .muted {
    color: #666;
  }

  .table-card {
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 10px 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    border-bottom: 1px solid #eee;
    padding: 10px;
  }

  a {
    color: #1b1b1f;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
