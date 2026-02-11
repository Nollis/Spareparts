<script>
  import { onMount } from "svelte";
  import {
    fetchMachineCategories,
    fetchCategories,
    getApiOrigin,
    searchProducts,
  } from "../lib/public-api.js";

  export let onNavigate = () => {};
  export let language = "se";

  let sections = [];
  let status = "loading";
  const apiOrigin = getApiOrigin();
  let leftSections = [];
  let rightSections = [];
  let activeLang = "se";
  let machineCats = [];
  let categoryCache = {};
  let searchQuery = "";
  let searchStatus = "idle";
  let searchResults = [];
  const copy = {
    se: {
      title: "Alla produkter",
      searchTitle: "Sök produkt via serienummer",
      searchHint: "Hitta en produkt genom att söka med ett serienummer nedan:",
      searchPlaceholder: "Sök...",
      searchButton: "Sök",
      searchEmpty: "Inga artiklar hittades.",
      searchResults: "Sökresultat",
      searchSku: "Artikel.nr",
      searchName: "Benämning",
      searchCategories: "Kategorier",
      loading: "Laddar produkter...",
      error: "Kunde inte hämta produktlistan.",
    },
    en: {
      title: "All products",
      searchTitle: "Search by serial number",
      searchHint: "Find a product by searching for a serial number below:",
      searchPlaceholder: "Search...",
      searchButton: "Search",
      searchEmpty: "No articles found.",
      searchResults: "Search results",
      searchSku: "Item no",
      searchName: "Description",
      searchCategories: "Categories",
      loading: "Loading products...",
      error: "Could not load the product list.",
    },
    pl: {
      title: "Wszystkie produkty",
      searchTitle: "Szukaj po numerze seryjnym",
      searchHint: "Znajdź produkt, wyszukując numer seryjny poniżej:",
      searchPlaceholder: "Szukaj...",
      searchButton: "Szukaj",
      searchEmpty: "Nie znaleziono pozycji.",
      searchResults: "Wyniki wyszukiwania",
      searchSku: "Nr artykułu",
      searchName: "Nazwa",
      searchCategories: "Kategorie",
      loading: "Ładowanie produktów...",
      error: "Nie udało się pobrać listy produktów.",
    },
  };
  $: activeLang = language;
  $: t = copy[language] || copy.se;

  function resolveUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/")) return `${apiOrigin}${url}`;
    return url;
  }

  // legacy helper removed

  async function hydrateProductCategories(items) {
    const mainKeys = new Set();
    items.forEach((item) => {
      (item.product_categories || []).forEach((cat) => {
        const key = cat.key || cat.slug;
        if (key) {
          const [mainKey] = String(key).split("-");
          if (mainKey) {
            mainKeys.add(mainKey);
          }
        }
      });
    });
    const categoryCache = {};
    for (const key of mainKeys) {
      try {
        categoryCache[key] = await fetchCategories(key);
      } catch {
        categoryCache[key] = [];
      }
    }
    return categoryCache;
  }

  function resolveCategoryFromKey(categoryCache, key) {
    if (!key) return null;
    const mainKey = String(key).split("-")[0];
    const list = categoryCache[mainKey] || [];
    return list.find((item) => (item.key || item.slug) === key) || null;
  }

  function shouldShowForLang(item) {
    const list = item?.showForLang;
    if (!list || !list.length) return false;
    return list.map((code) => String(code).toLowerCase()).includes(activeLang);
  }

  function getDisplayName(item, lang) {
    if (!item) return "";
    const langName = item.lang_name?.[lang];
    return langName || item.title || item.name || item.label || "";
  }

  function getProductName(item, lang) {
    if (!item) return "";
    if (lang === "en") {
      return item.name_en || item.name_sv || item.sku || "";
    }
    if (lang === "pl") {
      return item.name_pl || item.name_en || item.name_sv || item.sku || "";
    }
    return item.name_sv || item.name_en || item.sku || "";
  }

  function resolveCategoryName(key) {
    if (!key) return key;
    const mainKey = String(key).split("-")[0];
    const list = categoryCache[mainKey] || [];
    const match = list.find((item) => (item.key || item.slug) === key);
    if (!match) return key;
    return match.lang_name?.[activeLang] || match.name || key;
  }

  async function runSearch() {
    const term = searchQuery.trim();
    if (!term) {
      searchResults = [];
      searchStatus = "idle";
      return;
    }
    searchStatus = "loading";
    try {
      const results = await searchProducts(term, 50);
      searchResults = Array.isArray(results) ? results : [];
      searchStatus = "ready";
    } catch {
      searchResults = [];
      searchStatus = "error";
    }
  }

  function buildSections() {
    const topLevel = Array.isArray(machineCats)
      ? machineCats.filter((item) => !item.parent)
      : [];
    const results = topLevel
      .map((item) => {
        const children = (item.children || []).slice();
        children.sort(
          (a, b) => Number(a.menu_order || 0) - Number(b.menu_order || 0),
        );
        const childItems = children.map((child) => {
          let productCats = (child.product_categories || [])
            .map((cat) => ({
              ...cat,
              key: cat.key || cat.slug, // Ensure key property exists for downstream use
              image:
                resolveCategoryFromKey(categoryCache, cat.key || cat.slug)
                  ?.image || null,
            }))
            .filter((cat) => cat.key);
          productCats = productCats
            .filter((cat) => shouldShowForLang(cat))
            // Don't filter out categories without images, just show them
            .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
          return { ...child, product_categories: productCats };
        });
        // Filter out children that have no visible products
        const visibleChildItems = childItems.filter(
          (child) => child.product_categories.length > 0,
        );

        return {
          key: String(item.id),
          root: { name: getDisplayName(item) || "Category" },
          children: visibleChildItems,
          childrenByParent: new Map(
            visibleChildItems.map((child) => [
              child.id,
              child.product_categories || [],
            ]),
          ),
        };
      })
      .filter((res) => res.children.length > 0);
    sections = results;
    leftSections = results.filter((_, index) => index % 2 === 0);
    rightSections = results.filter((_, index) => index % 2 === 1);
  }

  onMount(async () => {
    try {
      machineCats = await fetchMachineCategories();
      categoryCache = await hydrateProductCategories(machineCats || []);
      buildSections();
      status = "ready";
    } catch (error) {
      status = "error";
    }
  });

  $: if (status === "ready") {
    language;
    buildSections();
  }

  let expanded = {};

  function selectChild(sectionKey, child) {
    expanded = {
      ...expanded,
      [sectionKey]: expanded[sectionKey] === child.id ? null : child.id,
    };
  }

  function getExpandedCards(section) {
    const selectedId = expanded[section.key];
    if (!selectedId) return [];
    const direct = section.childrenByParent.get(selectedId) || [];
    return direct;
  }
</script>

<section class="product-page">
  <div class="container">
    <h2 class="page-title">{t.title}</h2>

    <div class="search-card">
      <div>
        <h3>{t.searchTitle}</h3>
        <p>{t.searchHint}</p>
      </div>
      <form class="search-input" on:submit|preventDefault={runSearch}>
        <input
          type="text"
          placeholder={t.searchPlaceholder}
          bind:value={searchQuery}
        />
        <button type="submit" aria-label={t.searchButton}>🔍</button>
      </form>
    </div>

    {#if searchStatus === "loading"}
      <p>{t.searchResults}: ...</p>
    {:else if searchStatus === "ready"}
      <div class="search-results">
        <div class="search-results__title">{t.searchResults}</div>
        {#if searchResults.length === 0}
          <div class="search-results__empty">{t.searchEmpty}</div>
        {:else}
          <table class="search-table">
            <thead>
              <tr>
                <th>{t.searchSku}</th>
                <th>{t.searchName}</th>
                <th>{t.searchCategories}</th>
              </tr>
            </thead>
            <tbody>
              {#each searchResults as result}
                <tr>
                  <td>{result.sku}</td>
                  <td>{getDisplayName(result, language)}</td>
                  <td>
                    <div class="chip-list">
                      {#each result.categories || [] as catKey}
                        <button
                          class="chip"
                          type="button"
                          on:click={() => onNavigate(`/category/${catKey}`)}
                        >
                          {resolveCategoryName(catKey)}
                        </button>
                      {/each}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {/if}

    {#if status === "loading"}
      <p>{t.loading}</p>
    {:else if status === "error"}
      <p>{t.error}</p>
    {:else}
      <div class="product-columns">
        <div class="column">
          {#each leftSections as section}
            <article class="list-card">
              <h3>{section.root?.name || section.key}</h3>
              <div class="list">
                {#each section.children as child}
                  <div class="list-item-block">
                    <button
                      class="list-item"
                      on:click={() => selectChild(section.key, child)}
                    >
                      <span class="caret"></span>
                      {getDisplayName(child, language)}
                    </button>
                    {#if expanded[section.key] === child.id}
                      <div class="expanded-grid inline-grid">
                        {#each getExpandedCards(section) as card}
                          <button
                            class="expanded-card"
                            on:click={() => onNavigate(`/category/${card.key}`)}
                          >
                            {#if card.product_catalog_image_url}
                              <img
                                src={resolveUrl(card.product_catalog_image_url)}
                                alt={getDisplayName(card, language)}
                              />
                            {:else if card.image?.src}
                              <img
                                src={resolveUrl(card.image.src)}
                                alt={getDisplayName(card, language)}
                              />
                            {:else}
                              <div class="placeholder"></div>
                            {/if}
                            <span>{getDisplayName(card, language)}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </article>
          {/each}
        </div>
        <div class="column">
          {#each rightSections as section}
            <article class="list-card">
              <h3>{section.root?.name || section.key}</h3>
              <div class="list">
                {#each section.children as child}
                  <div class="list-item-block">
                    <button
                      class="list-item"
                      on:click={() => selectChild(section.key, child)}
                    >
                      <span class="caret"></span>
                      {getDisplayName(child, language)}
                    </button>
                    {#if expanded[section.key] === child.id}
                      <div class="expanded-grid inline-grid">
                        {#each getExpandedCards(section) as card}
                          <button
                            class="expanded-card"
                            on:click={() => onNavigate(`/category/${card.key}`)}
                          >
                            {#if card.product_catalog_image_url}
                              <img
                                src={resolveUrl(card.product_catalog_image_url)}
                                alt={getDisplayName(card, language)}
                              />
                            {:else if card.image?.src}
                              <img
                                src={resolveUrl(card.image.src)}
                                alt={getDisplayName(card, language)}
                              />
                            {:else}
                              <div class="placeholder"></div>
                            {/if}
                            <span>{getDisplayName(card, language)}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>
