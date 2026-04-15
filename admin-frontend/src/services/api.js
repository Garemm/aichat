// ── API service — JWT-authenticated fetch wrapper ────────────────────────────
// Access token lives in module scope (memory only — never localStorage).
// AuthContext owns the token lifecycle; it registers callbacks here.

const BASE = '/admin';

// ── Token store (module-level, no persistence) ────────────────────────────────
let _accessToken = null;

/**
 * Called by AuthContext every time a new access token is obtained
 * (on login or on silent refresh).
 */
export const setAccessToken = (token) => { _accessToken = token; };

// ── Refresh queue (prevents duplicate refresh calls on concurrent 401s) ───────
let _refreshFn  = null;
let _refreshing = false;
let _refreshQueue = [];

/**
 * Called by AuthContext on mount to register the silent-refresh function.
 * When any authenticated request receives a 401, api.js calls this function
 * once (even if several requests failed simultaneously) and retries all of them.
 */
export const setRefreshCallback = (fn) => { _refreshFn = fn; };

const runRefresh = () => {
  if (_refreshing) {
    // Already in progress — enqueue and wait for the same result
    return new Promise((resolve, reject) => _refreshQueue.push({ resolve, reject }));
  }
  _refreshing = true;
  return _refreshFn()
    .then((token) => { _refreshQueue.forEach((p) => p.resolve(token)); return token; })
    .catch((err)  => { _refreshQueue.forEach((p) => p.reject(err));   throw err;  })
    .finally(()   => { _refreshing = false; _refreshQueue = []; });
};

// ── Internal fetch helpers ────────────────────────────────────────────────────
const authHeaders = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...(_accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}),
  ...extra,
});

/**
 * Authenticated request with automatic 401 → refresh → retry.
 * Pass { skipRetry: true } to skip the retry (used internally to avoid loops).
 */
const request = async (url, options = {}) => {
  const { skipRetry = false, extraHeaders = {}, ...fetchOpts } = options;
  const makeHeaders = () => authHeaders(extraHeaders);

  let res = await fetch(url, { ...fetchOpts, headers: makeHeaders() });

  if (res.status === 401 && !skipRetry && _refreshFn) {
    try {
      await runRefresh();
      // Retry once with the new token now pushed into _accessToken by silentRefresh
      res = await fetch(url, { ...fetchOpts, headers: makeHeaders() });
    } catch {
      throw new Error('Sesión expirada');
    }
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error del servidor');
  return json.data ?? json;
};

/**
 * Public (unauthenticated) request — no auth header, no 401 retry.
 */
const publicRequest = async (url, options = {}) => {
  const res  = await fetch(url, { ...options });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Error del servidor');
  return json.data ?? json;
};

// ── Auth endpoints (public) ───────────────────────────────────────────────────
export const login = (username, password) =>
  publicRequest(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

/**
 * Silent refresh — uses the HTTP-only `rt` cookie automatically.
 * credentials: 'include' is technically redundant on same-origin (Vite proxy),
 * but is required in production if the API is on a different subdomain.
 */
export const apiRefresh = () =>
  fetch(`${BASE}/refresh`, { method: 'POST', credentials: 'include' }).then(async (res) => {
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Sesión expirada');
    return json;
  });

export const apiLogout = () =>
  fetch(`${BASE}/logout`, { method: 'POST', credentials: 'include' })
    .catch(() => undefined); // always succeeds on the client side

export const forgotPassword = (email) =>
  publicRequest(`${BASE}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

export const resetPassword = (token, password, confirmPassword) =>
  publicRequest(`${BASE}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, confirmPassword }),
  });

export const register = (data) =>
  publicRequest(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

// ── Authenticated endpoints ───────────────────────────────────────────────────
export const changePassword = (currentPassword, newPassword, confirmPassword) =>
  request(`${BASE}/change-password`, {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });

export const getDashboard    = ()     => request(`${BASE}/dashboard`);
export const getBusinessInfo = ()     => request(`${BASE}/business`);
export const updateBusiness  = (data) => request(`${BASE}/business`, { method: 'PUT', body: JSON.stringify(data) });

// ── Categories ────────────────────────────────────────────────────────────────
export const getCategories  = ()          => request(`${BASE}/categories`);
export const createCategory = (data)      => request(`${BASE}/categories`,     { method: 'POST',   body: JSON.stringify(data) });
export const updateCategory = (id, data)  => request(`${BASE}/categories/${id}`, { method: 'PUT',  body: JSON.stringify(data) });
export const deleteCategory = (id)        => request(`${BASE}/categories/${id}`, { method: 'DELETE' });

// ── Products ──────────────────────────────────────────────────────────────────
export const getProducts   = ()          => request(`${BASE}/products`);
export const getProduct    = (id)        => request(`${BASE}/products/${id}`);
export const createProduct = (data)      => request(`${BASE}/products`,     { method: 'POST',   body: JSON.stringify(data) });
export const updateProduct = (id, data)  => request(`${BASE}/products/${id}`, { method: 'PUT',  body: JSON.stringify(data) });
export const deleteProduct = (id)        => request(`${BASE}/products/${id}`, { method: 'DELETE' });

// ── Services ──────────────────────────────────────────────────────────────────
export const getServices   = ()          => request(`${BASE}/services`);
export const getService    = (id)        => request(`${BASE}/services/${id}`);
export const createService = (data)      => request(`${BASE}/services`,     { method: 'POST',   body: JSON.stringify(data) });
export const updateService = (id, data)  => request(`${BASE}/services/${id}`, { method: 'PUT',  body: JSON.stringify(data) });
export const deleteService = (id)        => request(`${BASE}/services/${id}`, { method: 'DELETE' });

// ── Promotions ────────────────────────────────────────────────────────────────
export const getPromotions   = ()          => request(`${BASE}/promotions`);
export const getPromotion    = (id)        => request(`${BASE}/promotions/${id}`);
export const createPromotion = (data)      => request(`${BASE}/promotions`,     { method: 'POST',   body: JSON.stringify(data) });
export const updatePromotion = (id, data)  => request(`${BASE}/promotions/${id}`, { method: 'PUT',  body: JSON.stringify(data) });
export const deletePromotion = (id)        => request(`${BASE}/promotions/${id}`, { method: 'DELETE' });

// ── Business Hours ────────────────────────────────────────────────────────────
export const getHours    = ()     => request(`${BASE}/hours`);
export const saveHour    = (data) => request(`${BASE}/hours`,      { method: 'POST', body: JSON.stringify(data) });
export const saveAllHours = (days) => request(`${BASE}/hours/bulk`, { method: 'POST', body: JSON.stringify({ days }) });

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getTopProducts = (businessId) =>
  request(`${BASE}/analytics/top-products/${businessId}`)
    .then((res) => res.data ?? res);

export const getTrafficByHour = (businessId) =>
  request(`${BASE}/analytics/traffic-by-hour/${businessId}`)
    .then((res) => res.data ?? res);

// ── Bulk Import ───────────────────────────────────────────────────────────────
export const importPreview = (file) => {
  const form = new FormData();
  form.append('file', file);
  // FormData: let the browser set Content-Type + boundary; inject Bearer manually
  const headers = { ...(_accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}) };
  return fetch(`${BASE}/products/import/preview`, { method: 'POST', headers, body: form })
    .then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error del servidor');
      return json.data ?? json;
    });
};

export const importConfirm = (rows, createMissingCategories = false) =>
  request(`${BASE}/products/import/confirm`, {
    method: 'POST',
    body: JSON.stringify({ rows, createMissingCategories }),
  });

// ── Subscriptions ─────────────────────────────────────────────────────────────
export const getSubscriptions     = ()                    => request(`${BASE}/subscriptions`);
export const toggleSubscription   = (id, is_active)       => request(`${BASE}/subscriptions/${id}`, {
  method: 'PUT',
  body: JSON.stringify({ is_active }),
});
export const setSubscriptionPlan  = (id, subscription_id) => request(`${BASE}/subscriptions/${id}/plan`, {
  method: 'PUT',
  body: JSON.stringify({ subscription_id }),
});

// ── Business types (public — used by Register + BusinessForm) ─────────────────
export const getBusinessTypes = () =>
  publicRequest(`${BASE}/business-types`)
    .then((res) => res.data ?? res);

export const getLegalDocument = (type) =>
  publicRequest(`${BASE}/legal/${type}`)
    .then((res) => res.content ?? res?.data?.content ?? '');

// ── Pedidos ───────────────────────────────────────────────────────────────────
export const getTodaysOrders    = ()              => request(`${BASE}/orders/today`, { cache: 'no-store' });
export const updateOrder        = (id, changes)   => request(`${BASE}/orders/${id}`, {
  method: 'PUT',
  body: JSON.stringify(changes),
});
export const setAceptaPedidos   = (value)   => request(`${BASE}/business/acepto-pedidos`, {
  method: 'PUT',
  body: JSON.stringify({ acepto_pedidos: value }),
});

