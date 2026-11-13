const DATA_BASE = "https://www.torn-tracker.com/api/open/v1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization"
  };
}

async function readConfig(env) {
  const row = await env.DB.prepare("SELECT config_json FROM app_config WHERE id = 1").first();
  if (!row) return { businessName: "Father_of_5's Trading .co", items: [] };
  try { return JSON.parse(row.config_json); }
  catch { return { businessName: "Father_of_5's Trading .co", items: [] }; }
}

function authorized(request, env) {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) return false;
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${expected}`;
}

async function refreshPrices(env) {
  const config = await readConfig(env);
  const active = (config.items || []).filter(x => x.enabled && Number.isInteger(Number(x.id)));
  if (!active.length) return;

  const state = await env.DB.prepare("SELECT cursor FROM refresh_state WHERE id = 1").first();
  const cursor = Number(state?.cursor || 0) % active.length;
  // Keep well below the provider's published per-address request ceiling.
  const batchSize = Math.min(40, active.length);
  const batch = [];
  for (let i = 0; i < batchSize; i++) batch.push(active[(cursor + i) % active.length]);

  for (const item of batch) {
    try {
      const response = await fetch(`${DATA_BASE}/bazaar/items/${encodeURIComponent(item.id)}`, {
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) continue;
      const data = await response.json();
      const listings = Array.isArray(data.listings) ? data.listings : [];
      const valid = listings.filter(x => Number(x.price) > 0);
      const lowest = valid.length ? Math.min(...valid.map(x => Number(x.price))) : null;
      const qty = lowest === null ? null : valid.filter(x => Number(x.price) === lowest)
        .reduce((sum, x) => sum + Number(x.quantity || 0), 0);

      let buyPrice = null;
      const mode = item.mode === "fixed" ? "fixed" : "percent";
      if (mode === "fixed") {
        buyPrice = Math.max(0, Math.floor(Number(item.fixedPrice || 0)));
      } else if (lowest !== null) {
        const discount = Math.max(0, Math.min(99.9, Number(item.discountPercent ?? 10)));
        buyPrice = Math.floor(lowest * (1 - discount / 100));
      }

      const observed = valid.map(x => x.observed_at).filter(Boolean).sort().slice(-1)[0] || null;
      const age = valid.length ? Math.min(...valid.map(x => Number(x.age_s ?? 999999))) : null;
      const reporters = valid.length ? Math.max(...valid.map(x => Number(x.reporters || 0))) : null;
      const source = valid.length ? (valid.some(x => x.source === "both") ? "both" : valid[0].source || "unknown") : null;

      await env.DB.prepare(`
        INSERT INTO item_prices
        (item_id,item_name,lowest_bazaar,buy_price,pricing_mode,discount_percent,fixed_price,
         quantity_available,observed_at,age_s,reporters,source,refreshed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(item_id) DO UPDATE SET
          item_name=excluded.item_name, lowest_bazaar=excluded.lowest_bazaar,
          buy_price=excluded.buy_price, pricing_mode=excluded.pricing_mode,
          discount_percent=excluded.discount_percent, fixed_price=excluded.fixed_price,
          quantity_available=excluded.quantity_available, observed_at=excluded.observed_at,
          age_s=excluded.age_s, reporters=excluded.reporters, source=excluded.source,
          refreshed_at=excluded.refreshed_at
      `).bind(
        Number(item.id), String(item.name || `Item ${item.id}`), lowest, buyPrice, mode,
        mode === "percent" ? Number(item.discountPercent ?? 10) : null,
        mode === "fixed" ? Number(item.fixedPrice || 0) : null,
        qty, observed, age, reporters, source, new Date().toISOString()
      ).run();
    } catch (e) {
      // One unavailable item must not stop the remaining batch.
    }
  }

  const nextCursor = (cursor + batch.length) % active.length;
  await env.DB.prepare("UPDATE refresh_state SET cursor = ?, last_run = ? WHERE id = 1")
    .bind(nextCursor, new Date().toISOString()).run();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    if (url.pathname === "/api/prices" && request.method === "GET") {
      const rows = await env.DB.prepare(`
        SELECT item_id AS id, item_name AS name, lowest_bazaar AS lowestBazaar,
          buy_price AS buyPrice, pricing_mode AS mode, quantity_available AS quantity,
          observed_at AS observedAt, age_s AS ageSeconds, reporters, source, refreshed_at AS refreshedAt
        FROM item_prices ORDER BY item_name COLLATE NOCASE
      `).all();
      const config = await readConfig(env);
      const enabled = new Set((config.items || []).filter(x => x.enabled).map(x => Number(x.id)));
      const items = (rows.results || []).filter(x => enabled.has(Number(x.id)));
      const state = await env.DB.prepare("SELECT last_run FROM refresh_state WHERE id = 1").first();
      return json({
        businessName: config.businessName || "Father_of_5's Trading .co",
        items,
        lastRefresh: state?.last_run || null,
        attribution: "Bazaar data: Torn Tracker contributors (CC BY 4.0). Listings are shared voluntarily and may be incomplete."
      });
    }

    if (url.pathname === "/api/admin/config" && request.method === "GET") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      return json(await readConfig(env));
    }

    if (url.pathname === "/api/admin/config" && request.method === "PUT") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      let config;
      try { config = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      if (!config || !Array.isArray(config.items)) return json({ error: "Config must include an items array." }, 400);
      config.businessName = "Father_of_5's Trading .co";
      config.items = config.items.map(x => ({
        id: Number(x.id), name: String(x.name || `Item ${x.id}`).slice(0, 100),
        enabled: Boolean(x.enabled), mode: x.mode === "fixed" ? "fixed" : "percent",
        discountPercent: Math.max(0, Math.min(99.9, Number(x.discountPercent ?? 10))),
        fixedPrice: Math.max(0, Math.floor(Number(x.fixedPrice || 0)))
      })).filter(x => Number.isInteger(x.id) && x.id > 0);
      await env.DB.prepare(`
        INSERT INTO app_config (id, config_json, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at
      `).bind(JSON.stringify(config), new Date().toISOString()).run();
      return json({ ok: true, savedItems: config.items.length });
    }


    if (url.pathname === "/api/admin/catalog" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      if (!env.TORN_API_KEY) return json({ error: "Torn API key is not configured on the server yet." }, 400);
      const r = await fetch("https://api.torn.com/torn/?selections=items&key=" + encodeURIComponent(env.TORN_API_KEY));
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) return json({ error: data.error?.error || "Torn API catalogue request failed." }, 502);
      const source = data.items || {};
      const items = Object.entries(source).map(([id, item]) => ({
        id: Number(id), name: String(item.name || `Item ${id}`)
      })).filter(x => Number.isInteger(x.id) && x.id > 0);
      return json({ items, count: items.length, fetchedAt: new Date().toISOString() });
    }

    if (url.pathname === "/api/admin/refresh" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      await refreshPrices(env);
      return json({ ok: true, message: "A refresh batch was requested. Provider observations may still be older." });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshPrices(env));
  }
};
