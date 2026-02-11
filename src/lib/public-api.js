const fallbackApiBase = "http://localhost:8788/api";
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PUBLIC_API_BASE) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  fallbackApiBase;

const JSON_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PUBLIC_JSON_BASE) ||
  API_BASE.replace(/\/api\/?$/, "") + "/json";

const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

async function requestJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export function getApiOrigin() {
  return API_ORIGIN;
}

export async function fetchMainProducts() {
  return requestJson(`${API_BASE}/main-products`);
}

export async function fetchCategories(mainKey) {
  return requestJson(`${JSON_BASE}/categories-${encodeURIComponent(mainKey)}.json`);
}

export async function fetchProducts(mainKey) {
  return requestJson(`${JSON_BASE}/products-${encodeURIComponent(mainKey)}.json`);
}

export async function fetchMachineCategories() {
  return requestJson(`${JSON_BASE}/machine-categories.json`);
}

export async function searchProducts(query, limit = 50) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (limit) params.set("limit", String(limit));
  return requestJson(`${API_BASE}/products?${params.toString()}`);
}

export async function searchArticles(query, limit = 50, lang = "sv") {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (limit) params.set("limit", String(limit));
  if (lang) params.set("lang", lang === "se" ? "sv" : lang);
  return requestJson(`${API_BASE}/search?${params.toString()}`);
}

export async function fetchImageMap(key) {
  return requestJson(`${API_ORIGIN}/wp-json/wccd/v1/get-image-map/${encodeURIComponent(key)}`);
}

export async function fetchCategoryDetail(key) {
  return requestJson(`${API_BASE}/image-maps/${encodeURIComponent(key)}`);
}

export async function fetchPriceSettings() {
  return requestJson(`${JSON_BASE}/price-settings.json`);
}
