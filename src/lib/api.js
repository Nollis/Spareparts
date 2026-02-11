const RAW_API_BASE = (import.meta.env.VITE_API_BASE || "").trim();
const API_BASE =
  RAW_API_BASE && RAW_API_BASE.startsWith("http")
    ? RAW_API_BASE
    : "http://localhost:8788/api";

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json();
}

export async function getStatus() {
  return requestJson("/status");
}

export async function listMainProducts() {
  return requestJson("/main-products");
}

export async function listMainProductCatalogs() {
  return requestJson("/main-products/catalogs");
}

export async function uploadMainProductCatalog(key, file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/main-products/${encodeURIComponent(key)}/catalog-image`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Upload failed (${response.status})`);
  }
  return response.json();
}

export async function clearMainProductCatalog(key) {
  const response = await fetch(`${API_BASE}/main-products/${encodeURIComponent(key)}/catalog-image`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function importProducts(formData) {
  const response = await fetch(`${API_BASE}/import/products`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Import failed (${response.status})`);
  }
  return response.json();
}

export async function importPricelist(formData) {
  const response = await fetch(`${API_BASE}/import/pricelist`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Import failed (${response.status})`);
  }
  return response.json();
}

export async function getPriceSettings() {
  return requestJson("/settings/price-currency");
}

export async function savePriceSettings(payload) {
  return requestJson("/settings/price-currency", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function login(email, password) {
  return requestJson("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

export async function logout() {
  return requestJson("/auth/logout", { method: "POST" });
}

export async function registerAccount(payload) {
  return requestJson("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function getCurrentUser() {
  return requestJson("/auth/me");
}

export async function updateUser(payload) {
  return requestJson("/user", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function listDeliveryAddresses() {
  return requestJson("/delivery-addresses");
}

export async function listCategories({ query = "", limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (query) {
    params.set("query", query);
  }
  if (limit) {
    params.set("limit", String(limit));
  }
  const suffix = params.toString();
  return requestJson(`/categories${suffix ? `?${suffix}` : ""}`);
}

export async function createCategory(payload) {
  return requestJson("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function updateCategories(payload) {
  return requestJson("/categories/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function deleteCategory(key, { cascade = false } = {}) {
  const suffix = cascade ? "?cascade=1" : "";
  const response = await fetch(`${API_BASE}/categories/${encodeURIComponent(key)}${suffix}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function listMachineCategories({ query = "", limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (query) {
    params.set("query", query);
  }
  if (limit) {
    params.set("limit", String(limit));
  }
  const suffix = params.toString();
  return requestJson(`/machine-categories${suffix ? `?${suffix}` : ""}`);
}

export async function createMachineCategory(payload) {
  return requestJson("/machine-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function updateMachineCategories(payload) {
  return requestJson("/machine-categories/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function deleteMachineCategory(id, { cascade = false } = {}) {
  const suffix = cascade ? "?cascade=1" : "";
  const response = await fetch(`${API_BASE}/machine-categories/${encodeURIComponent(id)}${suffix}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function addMachineCategoryLink(id, categoryKey, position = 0) {
  return requestJson(`/machine-categories/${encodeURIComponent(id)}/product-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryKey, position })
  });
}

export async function removeMachineCategoryLink(id, categoryKey) {
  const response = await fetch(
    `${API_BASE}/machine-categories/${encodeURIComponent(id)}/product-categories/${encodeURIComponent(categoryKey)}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function listProducts({ query = "", limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (query) {
    params.set("query", query);
  }
  if (limit) {
    params.set("limit", String(limit));
  }
  const suffix = params.toString();
  return requestJson(`/products${suffix ? `?${suffix}` : ""}`);
}

export async function createProduct(payload) {
  return requestJson("/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function updateProducts(payload) {
  return requestJson("/products/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function deleteProduct(sku) {
  const response = await fetch(`${API_BASE}/products/${encodeURIComponent(sku)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function addProductCategory(sku, categoryKey) {
  return requestJson(`/products/${encodeURIComponent(sku)}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryKey })
  });
}

export async function removeProductCategory(sku, categoryKey) {
  const response = await fetch(
    `${API_BASE}/products/${encodeURIComponent(sku)}/categories/${encodeURIComponent(categoryKey)}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function listLanguageCategories({ query = "", limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (query) {
    params.set("query", query);
  }
  if (limit) {
    params.set("limit", String(limit));
  }
  const suffix = params.toString();
  return requestJson(`/language/categories${suffix ? `?${suffix}` : ""}`);
}

export async function listLanguageProducts({ query = "", limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (query) {
    params.set("query", query);
  }
  if (limit) {
    params.set("limit", String(limit));
  }
  const suffix = params.toString();
  return requestJson(`/language/products${suffix ? `?${suffix}` : ""}`);
}

export async function saveLanguageItems(payload) {
  return requestJson("/language/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function generateJson(payload) {
  return requestJson("/generate-json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function listImageMaps(mainKey) {
  const params = new URLSearchParams();
  if (mainKey) {
    params.set("mainKey", mainKey);
  }
  const suffix = params.toString();
  return requestJson(`/image-maps${suffix ? `?${suffix}` : ""}`);
}

export async function getImageMapDetails(key) {
  return requestJson(`/image-maps/${encodeURIComponent(key)}`);
}

export async function saveImageMap(key, html) {
  return requestJson("/image-maps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, html })
  });
}

export async function deleteImageMap(key) {
  const response = await fetch(`${API_BASE}/image-maps/${encodeURIComponent(key)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function listAdminUsers() {
  return requestJson("/admin/users");
}

export async function createAdminUser(payload) {
  return requestJson("/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function updateAdminUser(id, payload) {
  return requestJson(`/admin/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function deleteAdminUser(id) {
  const response = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function listCompanies() {
  return requestJson("/admin/companies");
}

export async function createCompany(payload) {
  return requestJson("/admin/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function updateCompany(id, payload) {
  return requestJson(`/admin/companies/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function deleteCompany(id) {
  const response = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}

export async function listAdminDeliveryAddresses(companyId = "") {
  const params = new URLSearchParams();
  if (companyId) {
    params.set("company_id", String(companyId));
  }
  const suffix = params.toString();
  return requestJson(`/admin/delivery-addresses${suffix ? `?${suffix}` : ""}`);
}

export async function createDeliveryAddress(payload) {
  return requestJson("/admin/delivery-addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function updateDeliveryAddress(id, payload) {
  return requestJson(`/admin/delivery-addresses/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function deleteDeliveryAddress(id) {
  const response = await fetch(`${API_BASE}/admin/delivery-addresses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Delete failed (${response.status})`);
  }
  return response.json();
}
