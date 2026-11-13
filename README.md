# Father_of_5's Trading .co — deployment package

A mobile-friendly public Torn buying-price page with a private admin control panel. Designed for Cloudflare Workers + D1. It does **not** automate in-game purchases or interact with Torn pages.

## Important data limitation

The bazaar feed used here is Torn Tracker's public open-data API:
- `GET https://www.torn-tracker.com/api/open/v1/bazaar/items/{item_id}`

It contains only bazaars that players voluntarily share with Torn Tracker. It is not a complete view of every bazaar in Torn. Listings are described as read within the last two hours, so a 30-second page refresh does not mean the underlying bazaar observations are 30 seconds old. The public page only shows your offer price; freshness/source limitations are in this README and the data provider's documentation.

The Worker polls a maximum of 40 selected items per minute to stay below the provider's published 60-requests/minute shared-address limit. With more than 40 selected items, it cycles through the list over successive minutes. Cloudflare Cron is configured for once per minute; the public page refreshes its display every 30 seconds.

Data attribution required by Torn Tracker's CC BY 4.0 terms: “Bazaar data: Torn Tracker contributors” with a link to its data page. This is included in the page footer.

## What you need

1. A free Cloudflare account.
2. Node.js installed on a computer (initial deployment is easiest on a computer; Android-only setup is possible but cumbersome).
3. Wrangler CLI: `npm install -g wrangler`
4. A D1 database.
5. A Torn API key with public access (used only to download the public item catalogue).
6. An admin password stored as a Worker secret.

## Deploy

From this project folder:

```bash
npm install -g wrangler
wrangler login
wrangler d1 create father-of-5-trading
```

Copy the `database_id` returned by Cloudflare into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

Create the tables:

```bash
wrangler d1 execute father-of-5-trading --remote --file=./schema.sql
```

Set your Torn API key as a server-side secret (never paste it into the website or share it publicly):

```bash
wrangler secret put TORN_API_KEY
```

Set a strong admin password (do not put it in the source files):

```bash
wrangler secret put ADMIN_PASSWORD
```

Deploy:

```bash
wrangler deploy
```

Cloudflare will provide a `*.workers.dev` public URL. Share that URL with Torn players. You can optionally add a custom domain later (a domain name itself is not free).

## First-time setup

1. Open your new public URL.
2. Tap **Control panel**.
3. Enter the admin password you set with `wrangler secret put`.
4. Tap **Fetch full Torn catalogue**. The Worker uses your server-side Torn API key to fetch the complete item list from Torn. Alternatively, import a JSON catalogue.
5. Enable the items you want to buy.
6. Choose `% below` and enter a discount, or choose `Fixed $` and enter your price.
7. Tap **Save changes**.

You can add an item manually by its Torn item ID and name if needed. Only enabled items appear on the public list.

## Admin access and security

- The admin password is sent to your Worker over HTTPS and kept in session storage for the current browser tab session.
- Use a unique, strong password. Do not share it with buyers.
- The public API returns only the enabled item names and buying prices; it never returns the admin password or private configuration controls.
- Anyone with the public URL can view the prices. Anyone with the admin password can change them.

## Rules and responsible use

This tool only reads Torn Tracker's published open data. It does not scrape Torn pages, automate gameplay, click buttons, or make purchases. Review Torn's current scripting/scraping rules before adding any Torn PDA userscript or direct Torn integration.

## Links

- Torn Tracker open-data guide: https://torn-tracker.com/guide/website/open-data/
- Torn Tracker developer API: https://torn-tracker.com/guide/website/developer-api/
- Torn scripting and scraping rules announcement: https://www.torn.com/forums.php?p=threads&t=16534470
- Cloudflare Workers documentation: https://developers.cloudflare.com/workers/
- Cloudflare D1 documentation: https://developers.cloudflare.com/d1/

## Current starter limitation

The package fetches the current item catalogue directly from Torn when you tap **Fetch full Torn catalogue**. This requires a public-access Torn API key configured as the `TORN_API_KEY` Worker secret. The key stays on the server and is never sent to public visitors.
