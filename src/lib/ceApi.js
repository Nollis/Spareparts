export function normalizeBaseUrl(value) {
  if (!value) {
    return "";
  }
  return value.replace(/\/+$/, "");
}

export function defaultCeBaseUrl() {
  const envBase = typeof import.meta !== "undefined" ? import.meta.env?.VITE_CE_API_BASE : "";
  if (envBase) {
    return normalizeBaseUrl(envBase);
  }
  const managerBase = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE : "";
  if (managerBase) {
    return normalizeBaseUrl(managerBase.replace(/\/api\/?$/, "/api/ce"));
  }
  if (typeof window === "undefined") {
    return "";
  }
  return normalizeBaseUrl(`${window.location.origin}/api/ce`);
}

function buildFormBody(data) {
  const params = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    const safeValue = value === null || value === undefined ? "" : String(value);
    params.append(key, safeValue);
  });
  return params.toString();
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }

  return parseResponse(response);
}

export function createCeApi(baseUrl) {
  const apiBase = normalizeBaseUrl(baseUrl || defaultCeBaseUrl());

  if (!apiBase) {
    return {
      baseUrl: "",
      searchProducts: async () => [],
      getProduct: async () => null,
      saveProduct: async () => false,
      createProduct: async () => false,
      deleteProduct: async () => false,
      listModels: async () => [],
      getModel: async () => null,
      saveModel: async () => false,
      createModel: async () => false,
      deleteModel: async () => false
    };
  }

  const get = (path) => requestJson(`${apiBase}${path}`);
  const post = (path, data) =>
    requestJson(`${apiBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: buildFormBody(data)
    });

  return {
    baseUrl: apiBase,
    searchProducts: (search) => post("/ce-och-motorintyg-products-search", { serienummerText: search }),
    getProduct: (serial) => get(`/get-single-ce-och-motorintyg-product/${encodeURIComponent(serial)}`),
    saveProduct: (payload) => post("/save-ce-och-motorintyg-product", payload),
    createProduct: (serial) => post("/create-new-ce-och-motorintyg-product", { serienummer: serial }),
    deleteProduct: (serial) => post("/delete-ce-och-motorintyg-product", { serienummer: serial }),
    listModels: () => get("/get-all-ce-och-motorintyg-models"),
    getModel: (name) => post("/get-single-ce-och-motorintyg-model", { modellNamn: name }),
    saveModel: (payload) => post("/save-ce-och-motorintyg-model", payload),
    createModel: (name) => post("/create-new-ce-och-motorintyg-model", { modellNamn: name }),
    deleteModel: (name) => post("/delete-ce-och-motorintyg-model", { modellNamn: name })
  };
}
