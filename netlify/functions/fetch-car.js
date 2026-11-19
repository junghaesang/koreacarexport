// Netlify serverless function: auto-fill a single car's price from its Encar
// listing link, for the "Find a Car" quote builder (pane 4).
//
// Why this exists: customers were being asked to retype the price shown on
// each Encar listing by hand. This function takes the Encar link the
// customer pasted, looks up that exact listing, and hands back its price (in
// 만원, same unit Encar itself displays) so the frontend can fill it in
// automatically — the customer only has to paste the link, not also copy
// the price.
//
// It reuses the same Apify setup as search-cars.js in this folder (see that
// file's comments for the one-time setup steps: Apify account, API token,
// APIFY_TOKEN env var in Netlify). Both functions read the same token and
// the same FX rate, kept in sync below.
//
// Until APIFY_TOKEN is set, or the actor doesn't support a detail lookup, or
// this function isn't reachable at all (e.g. the static Claude Artifact
// mirror of this site, which has no backend), it returns a clear "not
// available" response and the frontend falls back to asking the customer to
// type the price in by hand — nothing breaks either way.
//
// IMPORTANT - NOT YET VERIFIED: this calls the same Apify actor as
// search-cars.js with mode:'detail' and a carId, on the assumption that the
// actor supports a single-listing detail lookup the same way it supports a
// keyword search. That has NOT been confirmed against the actor's real
// behavior (Apify doesn't publish a schema for it). Before relying on this
// in production: set APIFY_TOKEN, paste one real Encar link into the site,
// and check the Netlify function log for what the actor actually returns.
// If it doesn't support a 'detail' mode, this needs a different actor (one
// that scrapes a single listing page) or a small adjustment to runInput
// below once you can see the actor's real input schema in the Apify console.

var ACTOR = 'claude_code_reviewer~encar-scraper';
var FX_KRW_PER_USD = 1348; // keep in sync with search-cars.js and the frontend's FX_KRW_PER_USD

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json' };

  try {
    var token = process.env.APIFY_TOKEN;
    if (!token) {
      return { statusCode: 501, headers: headers, body: JSON.stringify({ ok: false, reason: 'not_configured' }) };
    }

    var q = (event && event.queryStringParameters) || {};
    var link = (q.url || '').trim();
    if (!link) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ ok: false, reason: 'missing_url' }) };
    }

    var carId = extractCarId(link);
    if (!carId) {
      // Most likely the customer pasted a search/listing URL (a page full of
      // cars) rather than one specific car's detail page.
      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: false, reason: 'not_a_detail_link' }) };
    }

    var runInput = { mode: 'detail', carId: carId, url: link, maxItems: 1 };
    var url = 'https://api.apify.com/v2/acts/' + ACTOR + '/run-sync-get-dataset-items?token=' + encodeURIComponent(token);

    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runInput)
    });

    if (!resp.ok) {
      var errText = '';
      try { errText = (await resp.text()).slice(0, 500); } catch (e) {}
      return { statusCode: 502, headers: headers, body: JSON.stringify({ ok: false, reason: 'upstream_error', detail: errText }) };
    }

    var items = await resp.json();
    var raw = Array.isArray(items) ? items[0] : null;
    var car = raw ? normalizeCarDetail(raw) : null;

    if (!car || !car.priceManwon) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: false, reason: 'no_price_found' }) };
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        ok: true,
        carId: carId,
        priceManwon: car.priceManwon,
        priceUSD: Math.round((car.priceManwon * 10000) / FX_KRW_PER_USD),
        fx: FX_KRW_PER_USD,
        model: car.model || null,
        year: car.year || null,
        mileage: car.mileage || null,
        fuel: car.fuel || null,
        source: 'live'
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ ok: false, reason: 'exception', detail: String((err && err.message) || err) }) };
  }
};

// Pulls the numeric listing id out of the various Encar link shapes
// customers might paste (desktop, mobile, fem.encar.com, with or without
// query strings / trailing slash).
function extractCarId(link) {
  var m = String(link).match(/\/cars?\/detail\/(\d+)/i);
  return m ? m[1] : null;
}

// Same defensive-mapping approach as normalizeCar() in search-cars.js: Apify
// doesn't publish an official schema for this actor, so this reads several
// likely key spellings for the price. priceKRW/price are expected in 만원
// (10,000 KRW) units, matching how Encar displays prices on the listing
// itself — confirm this against a real response before trusting it blindly.
function normalizeCarDetail(raw) {
  if (!raw) return null;
  var priceManwon = parseInt(raw.price || raw.priceKRW || raw.priceWon || raw.priceManwon || 0, 10);
  return {
    priceManwon: priceManwon || null,
    model: raw.model || raw.modelName || raw.title || null,
    year: parseInt(raw.year || raw.modelYear || raw.regYear || 0, 10) || null,
    mileage: parseInt(raw.mileage || raw.km || raw.odometer || 0, 10) || null,
    fuel: raw.fuel || raw.fuelType || null
  };
}
