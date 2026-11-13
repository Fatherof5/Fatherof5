const $ = (id) => document.getElementById(id);
let adminToken = "";
let catalogue = [];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  if (options.body) headers["Content-Type"] = "application/json";

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function money(value) {
  return "$" + Number(value || 0).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

async function loadPrices() {
  const grid = $("items");
  if (!grid) return;

  try {
    const data = await api("/api/prices");
    const items = data.items || [];
    const search = ($("search")?.value || "").toLowerCase();

    const filtered = items.filter(item =>
      item.name.toLowerCase().includes(search)
    );

    $("itemCount").textContent = items.length;
    $("updated").textContent = data.updated_at
      ? "Updated " + new Date(data.updated_at).toLocaleTimeString()
      : "Waiting for first update";

    if (!filtered.length) {
      grid.innerHTML = `<div class="empty">No items match your search.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(item => `
      <article class="item">
        <div>
          <div class="itemname">${escapeHTML(item.name)}</div>
          <div class="itemid">ITEM #${escapeHTML(item.item_id)}</div>
        </div>
        <div class="price">
          ${money(item.buy_price)}
          <small>MY BUYING PRICE</small>
        </div>
      </article>
    `).join("");
  } catch (error) {
    grid.innerHTML = `<div class="empty">Unable to load prices. Please refresh shortly.</div>`;
    console.error(error);
  }
}

function showAdmin() {
  $("adminModal")?.classList.remove("hidden");
}

function hideAdmin() {
  $("adminModal")?.classList.add("hidden");
}

async function login() {
  const password = $("adminPassword").value;
  if (!password) {
    alert("Enter your admin password.");
    return;
  }

  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });

    adminToken = result.token;
    $("loginArea").classList.add("hidden");
    $("adminArea").classList.remove("hidden
