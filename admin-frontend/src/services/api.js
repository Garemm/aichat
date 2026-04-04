// ── API service — thin wrapper around fetch ──────────────────────────────────
// All requests go to /admin (proxied to http://localhost:4000 in dev).
const BASE = '/admin';

const getBusinessId = () => localStorage.getItem('admin_business_id') || '';

const headers = () => ({
  'Content-Type': 'application/json',
  'x-business-id': getBusinessId(),
});

const handleRes = async (res) => {
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error del servidor');
  return json.data ?? json;
};

export const login = (username, password) =>
  fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(handleRes);

export const getDashboard  = ()     => fetch(`${BASE}/dashboard`,  { headers: headers() }).then(handleRes);
export const getBusinessInfo = ()   => fetch(`${BASE}/business`,   { headers: headers() }).then(handleRes);
export const updateBusiness = (data) =>
  fetch(`${BASE}/business`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleRes);

export const getCategories = () => fetch(`${BASE}/categories`, { headers: headers() }).then(handleRes);
export const createCategory = (data) =>
  fetch(`${BASE}/categories`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const updateCategory = (id, data) =>
  fetch(`${BASE}/categories/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const deleteCategory = (id) =>
  fetch(`${BASE}/categories/${id}`, { method: 'DELETE', headers: headers() }).then(handleRes);

// ── Products ──────────────────────────────────────────────────────────────────
export const getProducts   = ()     => fetch(`${BASE}/products`,       { headers: headers() }).then(handleRes);
export const getProduct    = (id)   => fetch(`${BASE}/products/${id}`, { headers: headers() }).then(handleRes);
export const createProduct = (data) =>
  fetch(`${BASE}/products`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const updateProduct = (id, data) =>
  fetch(`${BASE}/products/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const deleteProduct = (id) =>
  fetch(`${BASE}/products/${id}`, { method: 'DELETE', headers: headers() }).then(handleRes);

// ── Services ──────────────────────────────────────────────────────────────────
export const getServices   = ()     => fetch(`${BASE}/services`,       { headers: headers() }).then(handleRes);
export const getService    = (id)   => fetch(`${BASE}/services/${id}`, { headers: headers() }).then(handleRes);
export const createService = (data) =>
  fetch(`${BASE}/services`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const updateService = (id, data) =>
  fetch(`${BASE}/services/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const deleteService = (id) =>
  fetch(`${BASE}/services/${id}`, { method: 'DELETE', headers: headers() }).then(handleRes);

// ── Promotions ────────────────────────────────────────────────────────────────
export const getPromotions   = ()     => fetch(`${BASE}/promotions`,       { headers: headers() }).then(handleRes);
export const getPromotion    = (id)   => fetch(`${BASE}/promotions/${id}`, { headers: headers() }).then(handleRes);
export const createPromotion = (data) =>
  fetch(`${BASE}/promotions`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const updatePromotion = (id, data) =>
  fetch(`${BASE}/promotions/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleRes);
export const deletePromotion = (id) =>
  fetch(`${BASE}/promotions/${id}`, { method: 'DELETE', headers: headers() }).then(handleRes);

// ── Business Hours ────────────────────────────────────────────────────────────
export const getHours = () =>
  fetch(`${BASE}/hours`, { headers: headers() }).then(handleRes);

export const saveHour = (data) =>
  fetch(`${BASE}/hours`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleRes);

export const saveAllHours = (days) =>
  fetch(`${BASE}/hours/bulk`, { method: 'POST', headers: headers(), body: JSON.stringify({ days }) }).then(handleRes);

// ── Bulk Import ───────────────────────────────────────────────────────────────
export const importPreview = (file) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE}/products/import/preview`, {
    method: 'POST',
    headers: { 'x-business-id': getBusinessId() }, // no Content-Type — let browser set multipart boundary
    body: form,
  }).then(handleRes);
};

// createMissingCategories: pass true after the user confirms category creation
export const importConfirm = (rows, createMissingCategories = false) =>
  fetch(`${BASE}/products/import/confirm`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ rows, createMissingCategories }),
  }).then(handleRes);
