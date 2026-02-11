<script>
  import { onMount, createEventDispatcher } from "svelte";
  import {
    fetchCategories,
    fetchCategoryDetail,
    fetchPriceSettings,
    fetchMainProducts,
    fetchProducts,
    getApiOrigin,
  } from "../lib/public-api.js";
  import { addToCart } from "../lib/cartStore.js";
  import TreeMenu from "./TreeMenu.svelte";

  export let categoryKey = "";
  export let language = "se";
  export let currency = "SEK";
  export let currencyRate = 1;
  export let onNavigate = () => {};

  const apiOrigin = getApiOrigin();
  const dispatch = createEventDispatcher();

  let status = "loading";
  let statusError = "";
  let root = null;
  let selected = null;
  let mapHtml = "";
  let mapStatus = "idle";
  let mapImage = "";
  let products = [];
  let mapName = "imagemap";
  let allItems = [];
  let lastProductSignature = "";
  let lastLoadedKey = "";
  let quantities = {};
  let allProducts = [];
  let mainKey = "";
  const copy = {
    se: {
      selected: "Vald produkt",
      pdf: "PDF",
      table: {
        nr: "Nr",
        sku: "Artikel.nr",
        name: "Benämning",
        unit: "Enhet",
        list: "Listpris",
        net: "Nettopris",
        qty: "Antal",
      },
      empty: "Inga artiklar för vald kategori.",
      loadMap: "Laddar bildkarta...",
      mapError: "Kunde inte läsa bildkartan.",
      mapNone: "Ingen bildkarta än.",
      loadError: "Kunde inte hämta produktdata.",
    },
    en: {
      selected: "Selected product",
      pdf: "PDF",
      table: {
        nr: "No",
        sku: "Item no",
        name: "Description",
        unit: "Unit",
        list: "List price",
        net: "Net price",
        qty: "Qty",
      },
      empty: "No articles for selected category.",
      loadMap: "Loading image map...",
      mapError: "Could not load the image map.",
      mapNone: "No image map yet.",
      loadError: "Could not load product data.",
    },
    pl: {
      selected: "Wybrany produkt",
      pdf: "PDF",
      table: {
        nr: "Nr",
        sku: "Nr artykułu",
        name: "Nazwa",
        unit: "Jednostka",
        list: "Cena katalogowa",
        net: "Cena netto",
        qty: "Ilość",
      },
      empty: "Brak pozycji dla wybranej kategorii.",
      loadMap: "Ładowanie mapy obrazka...",
      mapError: "Nie udało się wczytać mapy obrazka.",
      mapNone: "Brak mapy obrazka.",
      loadError: "Nie udało się pobrać danych produktu.",
    },
  };
  $: t = copy[language] || copy.se;
  $: {
    const key = root?.key || "";
    const names = root?.lang_name || {};
    const fallback = root?.name || "";
    const signature = `${key}-${language}-${names[language] || fallback}`;
    if (signature !== lastProductSignature) {
      lastProductSignature = signature;
      dispatch("productChange", { key, names, fallback });
    }
  }

  function resolveUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/")) return `${apiOrigin}${url}`;
    return url;
  }

  function getLabel(item, index, parentLabel = "") {
    const currentNumber = index + 1;
    return parentLabel
      ? `${parentLabel}${currentNumber}.`
      : `${currentNumber}.`;
  }

  function getDisplayName(item, lang) {
    if (!item) return "";
    const langName = item.lang_name?.[lang];
    return langName || item.name || "";
  }

  function keyOf(item) {
    return item?.key || item?.slug || "";
  }

  function getChildren(items, parentId) {
    return items
      .filter((item) => item.parent === parentId)
      .sort((a, b) => {
        const posA = Number(a.pos_num || a.menu_order || a.position || 0);
        const posB = Number(b.pos_num || b.menu_order || b.position || 0);
        if (posA !== posB) return posA - posB;
        return (a.id || 0) - (b.id || 0);
      });
  }

  function resolveRoot(items, mainKeyValue) {
    if (!items.length) return null;
    return (
      items.find((item) => keyOf(item) === mainKeyValue) ||
      items.find((item) => !item.parent) ||
      items[0]
    );
  }

  function resolveSelected(items, rootItem, categoryKeyValue) {
    if (!items.length || !rootItem) return null;
    const rootKey = keyOf(rootItem);
    if (categoryKeyValue && categoryKeyValue !== rootKey) {
      const found = items.find((item) => keyOf(item) === categoryKeyValue);
      if (found) return found;
    }
    const children = getChildren(items, rootItem.id || 0);
    return children[0] || rootItem;
  }

  function resolveMapName(html) {
    if (!html) return "imagemap";
    const match = html.match(/<map[^>]*name=[\"']?([^\"'>\s]+)/i);
    return match ? match[1] : "imagemap";
  }

  function resolveMainKey(key, mainKeys) {
    if (!key) return key;
    if (!Array.isArray(mainKeys) || !mainKeys.length) return key;
    const matches = mainKeys.filter(
      (mainKey) => key === mainKey || key.startsWith(`${mainKey}-`),
    );
    if (!matches.length) return key;
    return matches.sort((a, b) => b.length - a.length)[0];
  }

  function stripMapImages(html) {
    if (!html) return "";
    return html.replace(/<img[^>]*>/gi, "");
  }

  let usePosNum = true; // NEW STATE
  let highlightedPos = null;
  let rowRefs = [];

  function getRowLabel(item, index) {
    if (usePosNum && item.pos_num && item.pos_num != "0") {
      return String(item.pos_num).trim();
    }
    return String(index + 1);
  }

  function handleMapClick(e) {
    // DEBUG LOG
    console.log("Map clicked", e.target, e.target.tagName);

    const target = e.target.closest("area");
    if (target) {
      e.preventDefault();
      const alt = target.getAttribute("alt");
      const title = target.getAttribute("title"); // Check title too
      const href = target.getAttribute("href"); // Check href too

      console.log("Area attributes:", { alt, title, href });

      // Fallback: try title if alt is missing, or try extracting from href
      let val = alt || title;
      if (!val && href) {
        if (href.includes("highlight=")) {
          const match = href.match(/highlight=([^&]+)/);
          if (match) val = match[1];
        } else if (href.includes("#")) {
          val = href.split("#")[1];
        }
      }

      if (val) {
        highlightedPos = val.trim();
        console.log("Highlighting:", highlightedPos);

        // Update URL without reload to reflect state
        const url = new URL(window.location);
        url.searchParams.set("highlight", highlightedPos);
        window.history.pushState({}, "", url);
      } else {
        console.warn("No identifier found on area tag");
      }
    } else {
      console.log("Click was not on an area tag (or closest failed)");
    }
  }

  $: if (highlightedPos && products.length && rowRefs.length) {
    console.log("Checking match for:", highlightedPos);
    products.forEach((p, i) => {
      const lbl = getRowLabel(p, i);
      if (lbl == highlightedPos)
        console.log("Match found at index:", i, "Label:", lbl);
    });

    const idx = products.findIndex(
      (p, i) => getRowLabel(p, i) === highlightedPos,
    );
    if (idx !== -1 && rowRefs[idx]) {
      console.log("Scrolling to index:", idx);
      rowRefs[idx].scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      console.warn("No match found or ref missing for:", highlightedPos);
    }
  }

  async function loadDetail(key) {
    // Check URL for highlight param if we don't have one yet
    const urlParams = new URLSearchParams(window.location.search);
    const paramHighlight = urlParams.get("highlight");
    if (paramHighlight) {
      highlightedPos = paramHighlight;
    } else {
      highlightedPos = null;
    }

    rowRefs = [];
    if (!key) {
      mapHtml = "";
      mapImage = "";
      products = [];
      mapStatus = "idle";
      return;
    }
    mapStatus = "loading";
    try {
      const result = await fetchCategoryDetail(key);
      const rawMap = result?.map?.html || "";
      mapHtml = stripMapImages(rawMap);
      mapImage = result?.image_url || "";

      // Use JSON products if available, otherwise fallback to API result (hybrid)
      if (allProducts.length > 0) {
        const filtered = allProducts.filter((p) =>
          p.categories?.some((c) => (c.key || c.slug) === key),
        );
        // Map to category-specific position and units
        const mapped = filtered.map((p) => {
          const catData = p.categories.find((c) => (c.key || c.slug) === key);
          return {
            ...p,
            pos_num: catData?.pos_num || p.pos_num || "0",
            no_units: catData?.no_units || p.no_units || "",
          };
        });

        // WordPress Sorting Logic for Included Parts (pos_num = 0)
        // 1. Separate main products (pos_num > 0)
        const mains = mapped.filter((p) => Number(p.pos_num) > 0);
        mains.sort((a, b) => {
          const diff = Number(a.pos_num) - Number(b.pos_num);
          if (diff !== 0) return diff;
          return a.sku.localeCompare(b.sku);
        });

        // 2. Separate included parts (pos_num = 0 and not markers)
        const included = mapped.filter(
          (p) =>
            (p.pos_num === "0" || p.pos_num === 0) &&
            p.sku !== ">" &&
            p.sku !== "<",
        );
        included.sort((a, b) => a.sku.localeCompare(b.sku));

        // 3. Find markers (SKU > and < with pos_num = 0)
        const beginMarker = mapped.find(
          (p) => (p.pos_num === "0" || p.pos_num === 0) && p.sku === ">",
        );
        const endMarker = mapped.find(
          (p) => (p.pos_num === "0" || p.pos_num === 0) && p.sku === "<",
        );

        // Reassemble: [Main Sorted] + [Begin Marker] + [Included Parts] + [End Marker]
        products = [...mains];
        if (included.length > 0) {
          if (beginMarker) products.push(beginMarker);
          products.push(...included);
          if (endMarker) products.push(endMarker);
        } else {
          // If no included parts, don't show markers even if they exist (usually)
          // But actually WordPress might show them? Let's follow simple reassembly.
        }
      } else {
        products = Array.isArray(result?.products) ? result.products : [];
      }

      // LOGIC FIX: Check if pos_num is useful
      const validPos = products
        .map((p) => String(p.pos_num || "").trim())
        .filter((p) => p && p !== "0");

      const distinctPos = new Set(validPos);

      // If we have products with pos_num, but they are all identical, fallback to index
      const allSame =
        products.length > 1 && validPos.length > 0 && distinctPos.size === 1;
      usePosNum = !allSame;

      quantities = {};
      products.forEach((p) => {
        const val = Number(p.no_units);
        if (!Number.isNaN(val) && val > 0) {
          quantities[p.sku] = val;
        }
      });
      mapName = resolveMapName(mapHtml);
      mapStatus = "ready";
    } catch {
      mapHtml = "";
      mapImage = "";
      products = [];
      quantities = {};
      mapStatus = "error";
    }
  }

  async function loadForKey(key) {
    if (!key || key === lastLoadedKey) return;
    lastLoadedKey = key;
    await loadDetail(key);
  }

  onMount(async () => {
    if (!categoryKey) {
      status = "error";
      return;
    }
    try {
      const mains = await fetchMainProducts().catch(() => []);
      const mainKeys = Array.isArray(mains)
        ? mains.map((item) => item.key).filter(Boolean)
        : [];
      mainKey = resolveMainKey(categoryKey, mainKeys);

      // Load all products for this main category from JSON
      allProducts = await fetchProducts(mainKey).catch((e) => {
        console.error("Failed to load products JSON:", e);
        return [];
      });

      const data = await fetchCategories(mainKey);
      const items = Array.isArray(data) ? data : [];
      allItems = items;
      root = resolveRoot(items, mainKey);

      // Select based on URL if possible, otherwise first child under root
      selected = resolveSelected(items, root, categoryKey);
      await loadForKey(keyOf(selected));
      status = "ready";
      status = "ready";
    } catch (error) {
      console.error("CategoryPage load error:", error);
      statusError = error.message || String(error);
      status = "error";
    }
  });

  function selectNode(item) {
    if (!item) return;
    selected = item;
    const key = keyOf(item);
    if (key) {
      if (typeof onNavigate === "function") {
        onNavigate(`/category/${key}`);
      }
      loadForKey(key);
    }
  }

  $: if (status === "ready" && categoryKey && allItems.length) {
    const next = resolveSelected(allItems, root, categoryKey);
    if (next && keyOf(next) !== keyOf(selected)) {
      selected = next;
      loadForKey(keyOf(next));
    }
  }

  function formatPrice(value, rate) {
    if (!value) return "";
    let num = Number(String(value).replace(",", "."));
    if (Number.isNaN(num)) return value;
    num = num / (rate || 1);
    return num.toFixed(2).replace(".", ",");
  }
</script>

<section class="category-page">
  <div class="container">
    {#if status === "loading"}
      <p>Laddar produktvy...</p>
    {:else if status === "error"}
      <p>{t.loadError} <br /><small style="color:red">{statusError}</small></p>
    {:else}
      <div class="category-layout">
        <aside class="category-sidebar">
          <div class="sidebar-title">{t.selected}</div>
          <div class="product-card">
            {#if root?.product_catalog_image_url}
              <img
                src={resolveUrl(root.product_catalog_image_url)}
                alt={getDisplayName(root)}
              />
            {:else if root?.image?.src}
              <img
                src={resolveUrl(root.image.src)}
                alt={getDisplayName(root)}
              />
            {:else}
              <div class="placeholder"></div>
            {/if}
          </div>
          <div class="product-name">{getDisplayName(root)}</div>
          {#key language}
            <nav class="category-tree" aria-label={t.selected}>
              <!-- TreeMenu handles the hierarchy for the Main Product -->
              <TreeMenu
                categories={allItems}
                {mainKey}
                {language}
                selectedKey={selected?.key || selected?.slug}
                on:select={(e) => selectNode(e.detail)}
              />
            </nav>
          {/key}
        </aside>
        <div class="category-view">
          <div class="category-header">
            <h2>{getDisplayName(selected, language)}</h2>
            <button class="pdf-button" type="button" aria-label={t.pdf}>
              <span class="pdf-icon" aria-hidden="true">{t.pdf}</span>
            </button>
          </div>
          <div class="category-content">
            {#if mapStatus === "loading" || mapStatus === "error" || mapHtml}
              <div class="image-map-wrapper">
                {#if mapStatus === "loading"}
                  <div class="map-placeholder">{t.loadMap}</div>
                {:else if mapStatus === "error"}
                  <div class="map-placeholder">{t.mapError}</div>
                {:else if mapHtml}
                  <div
                    class="map-content"
                    on:click={handleMapClick}
                    on:keydown={(e) => {
                      if (e.key === "Enter") handleMapClick(e);
                    }}
                    role="presentation"
                  >
                    {#if mapImage}
                      <img
                        src={resolveUrl(mapImage)}
                        alt={getDisplayName(selected, language)}
                        usemap={`#${mapName}`}
                      />
                    {/if}
                    {@html mapHtml}
                  </div>
                {/if}
              </div>
            {/if}
            <div class="articles-panel">
              <table class="articles-table">
                <thead>
                  <tr>
                    <th>{t.table.nr}</th>
                    <th>{t.table.sku}</th>
                    <th>{t.table.name}</th>
                    <th>{t.table.unit}</th>
                    <th>{t.table.list}</th>
                    <th>{t.table.net}</th>
                    <th>{t.table.qty}</th>
                  </tr>
                </thead>
                <tbody>
                  {#if products.length === 0}
                    <tr>
                      <td colspan="7" class="empty-row">{t.empty}</td>
                    </tr>
                  {:else}
                    {#each products as item, index}
                      <tr
                        class:highlight={getRowLabel(item, index) ===
                          highlightedPos}
                        bind:this={rowRefs[index]}
                      >
                        <td>{getRowLabel(item, index)}</td>
                        <td>{item.sku}</td>
                        <td>{getDisplayName(item, language)}</td>
                        <td>{item.no_units || ""}</td>
                        <td
                          >{formatPrice(item.price, currencyRate)}
                          {currency}</td
                        >
                        <td
                          >{formatPrice(item.price, currencyRate)}
                          {currency}</td
                        >
                        <td>
                          <div class="qty-cell">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={quantities[item.sku] || ""}
                              on:input={(e) => {
                                quantities[item.sku] = Number(e.target.value);
                              }}
                            />
                            <button
                              class="cart-mini"
                              type="button"
                              aria-label="Add to cart"
                              on:click={(e) => {
                                const q = quantities[item.sku] || 0;
                                if (q > 0) {
                                  addToCart(item, q);
                                  quantities[item.sku] = 0; // Reset UI
                                  e.target
                                    .closest(".qty-cell")
                                    .querySelector("input").value = ""; // Force clear input
                                }
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                              >
                                <circle cx="9" cy="21" r="1"></circle>
                                <circle cx="20" cy="21" r="1"></circle>
                                <path
                                  d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"
                                ></path>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  /* Ensure highlight is visible and overrides striping/hover if any */
  .highlight {
    background-color: #fff9c4 !important;
    transition: background-color 0.3s ease;
  }
  /* Ensure cells inside inherit or transparent so row color shows */
  .highlight td {
    background-color: #fff9c4 !important;
  }
</style>
