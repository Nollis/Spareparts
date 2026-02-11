<script>
  import { onMount } from "svelte";
  import ImportPanel from "./components/ImportPanel.svelte";
  import PriceListPanel from "./components/PriceListPanel.svelte";
  import JsonPanel from "./components/JsonPanel.svelte";
  import LanguagePanel from "./components/LanguagePanel.svelte";
  import TreeEditorPanel from "./components/TreeEditorPanel.svelte";
  import MainProductsPanel from "./components/MainProductsPanel.svelte";
  import CEPanel from "./components/CEPanel.svelte";
  import MachineCategoriesPanel from "./components/MachineCategoriesPanel.svelte";
  import ImageMapsPanel from "./components/ImageMapsPanel.svelte";
  import UsersPanel from "./components/UsersPanel.svelte";
  import CompaniesPanel from "./components/CompaniesPanel.svelte";
  import DeliveryAddressesPanel from "./components/DeliveryAddressesPanel.svelte";
  import HomePage from "./components/HomePage.svelte";
  import ProductsPage from "./components/ProductsPage.svelte";
  import CategoryPage from "./components/CategoryPage.svelte";
  import InfoPage from "./components/InfoPage.svelte";
  import RegisterPage from "./components/RegisterPage.svelte";
  import CheckoutPage from "./components/CheckoutPage.svelte";
  import SearchResultsPage from "./components/SearchResultsPage.svelte";
  import UserPage from "./components/UserPage.svelte";
  import CartModal from "./components/CartModal.svelte";
  import LoginModal from "./components/LoginModal.svelte";
  import { getStatus, getCurrentUser, logout } from "./lib/api.js";
  import { cartCount } from "./lib/cartStore.js";
  import { fetchPriceSettings } from "./lib/public-api.js";

  let activeTab = "import";
  let status = null;
  let route = "/";
  let routePath = "/";
  let routeSearch = "";
  let language = "se";
  let selectedProductKey = "";
  let selectedProductNames = {};
  let selectedProductFallback = "";
  let showCart = false;
  let showLogin = false;
  let currentUser = null;
  const langToFlag = {
    se: "se",
    en: "gb",
    pl: "pl",
  };
  const navLocale = {
    se: {
      spareParts: "Reservdelar",
      allProducts: "Alla produkter",
      selectedLabel: "Vald produkt",
      selectedNone: "Ingen",
      account: "Konto",
      currency: "Valuta",
      accountLogin: "Logga in",
      accountMyPage: "Min sida",
      accountLogout: "Logga ut",
      accountInfo: "Info / Kontakt",
      accountRegister: "Skapa konto",
      cart: "Kundvagn",
    },
    en: {
      spareParts: "Spare parts",
      allProducts: "All products",
      selectedLabel: "Selected product",
      selectedNone: "None",
      account: "Account",
      currency: "Currency",
      accountLogin: "Sign in",
      accountMyPage: "My page",
      accountLogout: "Log out",
      accountInfo: "Info / Contact",
      accountRegister: "Create account",
      cart: "Shopping cart",
    },
    pl: {
      spareParts: "Części zamienne",
      allProducts: "Wszystkie produkty",
      selectedLabel: "Wybrany produkt",
      selectedNone: "Brak",
      account: "Konto",
      currency: "Waluta",
      accountLogin: "Zaloguj się",
      accountMyPage: "Moja strona",
      accountLogout: "Wyloguj",
      accountInfo: "Informacje / Kontakt",
      accountRegister: "Utw&#243;rz konto",
      cart: "Koszyk",
    },
  };
  const navPlaceholders = {
    se: "Sök artiklar...",
    en: "Search articles...",
    pl: "Szukaj artykułów...",
  };
  let currencies = ["EUR", "NOK", "PLN", "SEK", "USD"];
  let activeCurrency = "SEK";
  let currencySettings = null;

  $: activeCurrencyRate =
    (currencySettings?.currencies || []).find((c) => c.code === activeCurrency)
      ?.rate || 1;

  const primaryTabs = [
    { id: "import", label: "Import" },
    { id: "category-editor", label: "Category editor" },
    { id: "product-editor", label: "Product editor" },
    { id: "main-products", label: "Main products" },
    { id: "machine-categories", label: "Machine categories" },
  ];

  const secondaryTabs = [
    { id: "users", label: "Users" },
    { id: "companies", label: "Companies" },
    { id: "delivery-addresses", label: "Delivery addresses" },
    { id: "ce", label: "CE / Motorintyg" },
  ];

  const utilityTabs = [
    { id: "pricelist", label: "Prices & currency" },
    { id: "language", label: "Languages" },
    { id: "image-maps", label: "Image maps" },
  ];

  const systemTabs = [{ id: "json", label: "Cache reload" }];

  const allTabs = [...primaryTabs, ...secondaryTabs, ...utilityTabs, ...systemTabs];
  $: activeTabLabel = allTabs.find((tab) => tab.id === activeTab)?.label || "Import";

  $: isAdmin = routePath.startsWith("/admin");
  $: publicPath = isAdmin ? "/" : routePath;
  $: isCategory = publicPath.startsWith("/category/");
  $: isInfoPage = publicPath === "/info";
  $: isUserPage = publicPath === "/user";
  $: isRegisterPage = publicPath === "/register";
  $: isCheckoutPage = publicPath === "/checkout";
  $: isSearchPage = publicPath === "/search";
  $: categoryKey = isCategory
    ? decodeURIComponent(publicPath.replace("/category/", ""))
    : "";
  $: isProductsPage = publicPath === "/products";
  $: navCopy = navLocale[language] || navLocale.se;
  $: navSearchPlaceholder = navPlaceholders[language] || navPlaceholders.se;
  $: selectedProductLabel = selectedProductKey
    ? selectedProductNames?.[language] ||
      selectedProductFallback ||
      selectedProductKey
    : navCopy.selectedNone;

  function selectTab(id) {
    activeTab = id;
  }

  function syncRoute() {
    routePath = window.location.pathname || "/";
    routeSearch = window.location.search || "";
    route = routePath + routeSearch;
  }

  function navigate(path) {
    if (path === route) return;
    window.history.pushState({}, "", path);
    syncRoute();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadStatus() {
    try {
      status = await getStatus();
    } catch (error) {
      status = null;
    }
  }

  async function loadCurrencySettings() {
    try {
      currencySettings = await fetchPriceSettings();
      if (currencySettings?.currencies) {
        currencies = currencySettings.currencies.map((c) => c.code);
        if (currencySettings.baseCurrency && !activeCurrency) {
          activeCurrency = currencySettings.baseCurrency;
        }
      }
    } catch (e) {
      console.error("Failed to load currency settings", e);
    }
  }

  onMount(() => {
    syncRoute();
    loadStatus();
    loadCurrencySettings();
    getCurrentUser()
      .then((user) => {
        currentUser = user;
      })
      .catch(() => {
        currentUser = null;
      });
    const storedLang = localStorage.getItem("sp-language");
    if (storedLang) {
      language = storedLang;
    }
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  });

  function setLanguage(code) {
    language = code;
    localStorage.setItem("sp-language", code);
  }

  function setCurrency(code) {
    activeCurrency = code;
  }

  function handleProductChange(event) {
    const detail = event?.detail || null;
    selectedProductKey = detail?.key || "";
    selectedProductNames = detail?.names || {};
    selectedProductFallback = detail?.fallback || "";
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const value = event.currentTarget?.querySelector("input")?.value || "";
    if (!value.trim()) return;
    navigate(`/search?query=${encodeURIComponent(value.trim())}`);
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      currentUser = null;
    }
  }
</script>

{#if isAdmin}
  <div class="admin-shell">
    <div class="admin-layout">
      <header class="admin-top">
        <div class="admin-brand">
          <h1>Spare Parts Manager</h1>
          <p>Lean import pipeline for products, categories, and images.</p>
          {#if status}
            <div class="admin-brand__stats">
              <span class="badge badge--categories"
                >Categories: {status.categoryCount}</span
              >
              <span class="badge badge--products"
                >Products: {status.productCount}</span
              >
              <span class="badge badge--main"
                >Main keys: {status.mainCount}</span
              >
            </div>
          {/if}
        </div>
      </header>
      <div class="admin-body">
        <aside class="admin-sidebar">
          <nav class="admin-nav" aria-label="Admin">
            <div class="admin-nav__section admin-nav__section--core">
              <div class="admin-nav__title">Core</div>
              {#each primaryTabs as tab}
                <button
                  class={`admin-nav__item ${activeTab === tab.id ? "active" : ""}`}
                  on:click={() => selectTab(tab.id)}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
            <div class="admin-nav__section admin-nav__section--management">
              <div class="admin-nav__title">Management</div>
              {#each secondaryTabs as tab}
                <button
                  class={`admin-nav__item ${activeTab === tab.id ? "active" : ""}`}
                  on:click={() => selectTab(tab.id)}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
            <div class="admin-nav__section admin-nav__section--utilities">
              <div class="admin-nav__title">Utilities</div>
              {#each utilityTabs as tab}
                <button
                  class={`admin-nav__item ${activeTab === tab.id ? "active" : ""}`}
                  on:click={() => selectTab(tab.id)}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
            <div class="admin-nav__section admin-nav__section--system">
              <div class="admin-nav__title">System</div>
              {#each systemTabs as tab}
                <button
                  class={`admin-nav__item ${activeTab === tab.id ? "active" : ""}`}
                  on:click={() => selectTab(tab.id)}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
          </nav>
        </aside>
        <main class="admin-main">
        <header class="admin-header">
          <div>
            <h2>{activeTabLabel}</h2>
          </div>
        </header>
          <div class="panel">
          {#if activeTab === "import"}
            <ImportPanel />
          {:else if activeTab === "category-editor"}
            <TreeEditorPanel mode="categories" />
          {:else if activeTab === "product-editor"}
            <TreeEditorPanel mode="products" />
          {:else if activeTab === "main-products"}
            <MainProductsPanel />
            {:else if activeTab === "pricelist"}
              <PriceListPanel />
            {:else if activeTab === "users"}
              <UsersPanel />
            {:else if activeTab === "companies"}
              <CompaniesPanel />
            {:else if activeTab === "delivery-addresses"}
              <DeliveryAddressesPanel />
            {:else if activeTab === "machine-categories"}
              <MachineCategoriesPanel />
            {:else if activeTab === "image-maps"}
              <ImageMapsPanel />
            {:else if activeTab === "ce"}
              <CEPanel />
            {:else if activeTab === "language"}
              <LanguagePanel />
            {:else}
              <JsonPanel />
            {/if}
          </div>
        </main>
      </div>
    </div>
  </div>
{:else}
  <div class="public-shell">
    <div class="top-stripe" aria-hidden="true"></div>
    <header class="site-header">
      <div class="container header-inner">
        <div class="brand">
          <a href="/" on:click|preventDefault={() => navigate("/")}>
            <img
              src="/design/assets/swepac-logo.png"
              alt="Swepac"
              class="brand-mark"
            />
          </a>
        </div>
        <nav class="main-nav" aria-label="Primary">
          <div class="nav-item">
            <button
              class="nav-trigger"
              type="button"
              class:active-nav={isProductsPage || isCategory}
            >
              {navCopy.spareParts}
              <span class="caret" aria-hidden="true"></span>
            </button>
            <div class="dropdown">
              <a
                href="/products"
                class="dropdown-item"
                on:click|preventDefault={() => navigate("/products")}
              >
                <i class="boxes icon" aria-hidden="true"></i>
                {navCopy.allProducts}
              </a>
              <div class="dropdown-item dropdown-item--meta">
                <i class="clipboard list icon" aria-hidden="true"></i>
                <div class="dropdown-meta-text">
                  <span class="dropdown-meta-label"
                    >{navCopy.selectedLabel}</span
                  >
                  {#if selectedProductKey}
                    <a
                      href={`/category/${selectedProductKey}`}
                      class="dropdown-meta-value link"
                      on:click|preventDefault={() =>
                        navigate(`/category/${selectedProductKey}`)}
                    >
                      {selectedProductLabel}
                    </a>
                  {:else}
                    <span class="dropdown-meta-value"
                      >{selectedProductLabel}</span
                    >
                  {/if}
                </div>
              </div>
            </div>
          </div>
          <div class="nav-item">
            <button class="nav-trigger" type="button">
              {navCopy.account}
              <span class="caret" aria-hidden="true"></span>
            </button>
            <div class="dropdown dropdown--account">
              <div class="dropdown-block">
                <div class="dropdown-block__title">
                  <i
                    class="money bill alternate outline icon"
                    aria-hidden="true"
                  ></i>
                  {navCopy.currency}
                </div>
                <div class="pill-list">
                  {#each currencies as code}
                    <button
                      type="button"
                      class={`pill ${code === activeCurrency ? "active" : ""}`}
                      on:click={() => setCurrency(code)}
                    >
                      {code}
                    </button>
                  {/each}
                </div>
              </div>
              {#if currentUser}
                <button
                  class="dropdown-item"
                  type="button"
                  on:click={() => navigate("/user")}
                >
                  <i class="user circle outline icon" aria-hidden="true"></i>
                  {navCopy.accountMyPage}
                </button>
                <button class="dropdown-item" type="button" on:click={handleLogout}>
                  <i class="sign out alternate icon" aria-hidden="true"></i>
                  {navCopy.accountLogout}
                </button>
              {:else}
                <button class="dropdown-item" type="button" on:click={() => navigate("/register")}>
                  <i class="user plus icon" aria-hidden="true"></i>
                  {navCopy.accountRegister}
                </button>
                <button class="dropdown-item" type="button" on:click={() => (showLogin = true)}>
                  <i class="sign in alternate icon" aria-hidden="true"></i>
                  {navCopy.accountLogin}
                </button>
              {/if}
              <button
                class="dropdown-item"
                type="button"
                on:click={() => navigate("/info")}
              >
                <i class="info circle icon" aria-hidden="true"></i>
                {navCopy.accountInfo}
              </button>
            </div>
          </div>
        </nav>
        <div class="nav-controls">
          <div class="nav-item language">
            <button
              class="nav-trigger"
              type="button"
              aria-label="Change language"
            >
              <i
                class={`fi fi-${langToFlag[language] || "gb"}`}
                aria-hidden="true"
              ></i>
              <span class="caret" aria-hidden="true"></span>
            </button>
            <div class="dropdown">
              <button class="flag-option" on:click={() => setLanguage("en")}>
                <i class="fi fi-gb" aria-hidden="true"></i> English
              </button>
              <button class="flag-option" on:click={() => setLanguage("se")}>
                <i class="fi fi-se" aria-hidden="true"></i> Svenska
              </button>
              <button class="flag-option" on:click={() => setLanguage("pl")}>
                <i class="fi fi-pl" aria-hidden="true"></i> Polski
              </button>
            </div>
          </div>
          <form class="search" role="search" on:submit={handleSearchSubmit}>
            <label class="sr-only" for="search-input">Search articles</label>
            <input
              id="search-input"
              type="search"
              placeholder={navSearchPlaceholder}
            />
            <button type="submit" aria-label="Search">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path
                  d="M12.9 14.32a8 8 0 1 1 1.41-1.41l5.35 5.33-1.42 1.42-5.33-5.34zM8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z"
                />
              </svg>
            </button>
          </form>
          <button class="cart" type="button" on:click={() => (showCart = true)}>
            <span class="cart-label">
              <i class="shopping cart icon" aria-hidden="true"></i>
              {navCopy.cart}
            </span>
            <span class="cart-count">{$cartCount}</span>
          </button>
        </div>
      </div>
    </header>
    <main>
      {#if isCategory}
        <CategoryPage
          {categoryKey}
          {language}
          currency={activeCurrency}
          currencyRate={activeCurrencyRate}
          onNavigate={navigate}
          on:productChange={handleProductChange}
        />
      {:else if isInfoPage}
        <InfoPage {language} />
      {:else if isRegisterPage}
        <RegisterPage {language} />
      {:else if isUserPage}
        <UserPage {language} />
      {:else if isCheckoutPage}
        <CheckoutPage {language} currency={activeCurrency} currencyRate={activeCurrencyRate} />
      {:else if isSearchPage}
        <SearchResultsPage {language} />
      {:else if isProductsPage}
        <ProductsPage onNavigate={navigate} {language} />
      {:else}
        <HomePage onNavigate={navigate} {language} />
      {/if}
    </main>

    {#if showCart}
      <CartModal
        currency={activeCurrency}
        currencyRate={activeCurrencyRate}
        onNavigate={(path) => {
          showCart = false;
          navigate(path);
        }}
        on:close={() => (showCart = false)}
      />
    {/if}
    {#if showLogin}
      <LoginModal
        on:close={() => (showLogin = false)}
        on:success={(event) => {
          currentUser = event.detail.user;
        }}
      />
    {/if}
  </div>
{/if}
