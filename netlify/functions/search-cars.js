// Netlify serverless function: live Encar search proxy for the "Find a Car" wizard.
//
// Why this exists: customers land on Encar's own site to filter cars and hit a wall
// when the filter screen suddenly switches to Korean. This function lets our own
// "Find a Car" form (which is in the customer's language) search real Encar
// inventory in the background, so the customer never has to touch Encar directly.
//
// It calls a third-party Apify "actor" that scrapes Encar, because Encar itself has
// no public API. The Apify API token is read from an environment variable so it is
// never exposed to the browser.
//
// ---- ONE-TIME SETUP (do this before it will return live results) ----
// 1. Create a free Apify account at https://apify.com (no credit card required;
//    the free plan includes ~$5/month of usage credit, plenty to test with).
// 2. Get your personal API token: Apify Console -> Settings -> Integrations.
// 3. In Netlify: Site settings -> Environment variables -> add a variable named
//    APIFY_TOKEN with that token as the value.
// 4. Trigger a new deploy (environment variable changes need a redeploy to apply).
//
// Until APIFY_TOKEN is set, or when this function isn't reachable at all (e.g. on
// the static Claude Artifact mirror of this site, which has no backend), the
// frontend automatically falls back to the curated demo list — nothing breaks.
//
// NOTE ON FIELD MAPPING: Apify does not publish an official schema for this actor,
// so normalizeCar() below reads several likely key spellings defensively. Once you
// have a real token, run one search from the site, then check the Netlify function
// log (or add a temporary console.log(items[0]) here) to see the actual field names
// the actor returns, and tighten this mapping to match exactly.

var ACTOR = 'claude_code_reviewer~encar-scraper';
var FX_KRW_PER_USD = 1348; // keep this in sync with the FX rate shown in the quote sheet on the site

var BRAND_MAP = {
  'Mercedes-Benz': 'Mercedes-Benz',
  'Kia': 'Kia',
  'Genesis': 'Genesis',
  'Hyundai': 'Hyundai',
  'BMW': 'BMW',
  'Audi': 'Audi'
};

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json' };

  try {
    var token = process.env.APIFY_TOKEN;
    if (!token) {
      // Not configured yet -> tell the frontend to fall back, don't error loudly.
      return { statusCode: 501, headers: headers, body: JSON.stringify({ error: 'APIFY_TOKEN not configured', matches: [] }) };
    }

    var q = (event && event.queryStringParameters) || {};
    var brand = (q.brand || '').trim();
    var yearFrom = parseInt(q.year, 10);
    var fuel = (q.fuel || '').trim();
    var keyword = (q.keyword || '').trim();

    var keywords = [];
    if (brand && BRAND_MAP[brand]) keywords.push(BRAND_MAP[brand]);
    else if (keyword) keywords.push(keyword);

    var runInput = {
      mode: 'search',
      carType: 'all',
      maxItems: 30
    };
    if (keywords.length) runInput.keywords = keywords;

    var url = 'https://api.apify.com/v2/acts/' + ACTOR + '/run-sync-get-dataset-items?token=' + encodeURIComponent(token);

    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runInput)
    });

    if (!resp.ok) {
      var errText = '';
      try { errText = (await resp.text()).slice(0, 500); } catch (e) {}
      return { statusCode: 502, headers: headers, body: JSON.stringify({ error: 'Upstream error', detail: errText, matches: [] }) };
    }

    var items = await resp.json();
    var cars = (Array.isArray(items) ? items : []).map(normalizeCar).filter(Boolean);

    if (!isNaN(yearFrom)) cars = cars.filter(function (c) { return c.year >= yearFrom; });
    if (fuel) cars = cars.filter(function (c) { return (c.fuel || '').toLowerCase().indexOf(fuel.toLowerCase()) !== -1; });
    if (keyword) {
      var kw = keyword.toLowerCase();
      cars = cars.filter(function (c) { return (c.brand + ' ' + c.model).toLowerCase().indexOf(kw) !== -1; });
    }

    cars = cars.slice(0, 5);

    return { statusCode: 200, headers: headers, body: JSON.stringify({ matches: cars, source: 'live', count: cars.length }) };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: String((err && err.message) || err), matches: [] }) };
  }
};

function normalizeCar(raw) {
  if (!raw) return null;

  var brand = raw.manufacturer || raw.brand || raw.maker || '';
  var model = raw.model || raw.modelName || raw.title || brand;
  var year = parseInt(raw.year || raw.modelYear || raw.regYear || 0, 10);
  var mileage = parseInt(raw.mileage || raw.km || raw.odometer || 0, 10);
  var fuel = raw.fuel || raw.fuelType || '';
  var trans = raw.transmission || raw.trans || 'Automatic';
  var badge = raw.badge || raw.certification || raw.accidentStatus || 'Encar Verified Inspection';
  var priceKRW = parseInt(raw.price || raw.priceKRW || raw.priceWon || 0, 10);
  var priceUSD = priceKRW ? Math.round(priceKRW / FX_KRW_PER_USD) : null;
  var carId = raw.car_id || raw.carId || raw.id;
  var link = raw.url || raw.link || (carId ? ('https://fem.encar.com/cars/detail/' + carId) : '');

  if (!brand || !model || !year) return null;

  return {
    brand: brand,
    model: model,
    year: year,
    reg: '',
    mileage: mileage,
    fuel: fuel,
    trans: trans,
    accident: badge,
    priceUSD: priceUSD,
    encarLink: link,
    link: 'https://wa.me/821073370522'
  };
}
