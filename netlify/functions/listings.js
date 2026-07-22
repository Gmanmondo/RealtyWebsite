// netlify/functions/listings.js
// Netlify serverless function — runs on Netlify's server, never in the browser.
// The Airtable token lives only here, as an environment variable, so it's
// never present in any code the visitor's browser can see.

exports.handler = async function () {
  const { AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_TOKEN } = process.env;

  if (!AIRTABLE_BASE_ID || !AIRTABLE_TABLE || !AIRTABLE_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Airtable environment variables are not configured.' })
    };
  }

  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}?sort%5B0%5D%5Bfield%5D=Order&sort%5B0%5D%5Bdirection%5D=asc`;

    const airtableRes = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!airtableRes.ok) {
      return {
        statusCode: airtableRes.status,
        body: JSON.stringify({ error: `Airtable responded ${airtableRes.status}` })
      };
    }

    const data = await airtableRes.json();

    // Only pass through the fields the site actually needs —
    // keeps the response minimal and avoids leaking anything extra.
    const listings = (data.records || []).map(record => {
      const f = record.fields;
      return {
        price: f.Price ?? null,
        address: f.Address ?? '',
        beds: f.Beds ?? null,
        baths: f.Baths ?? null,
        sqft: f.SqFt ?? '',
        status: f.Status ?? 'Active',
        mlsNumber: f.MLSNumber ?? '',
        photoUrl: f.Photo && f.Photo[0] ? f.Photo[0].url : '',
        // Realtor.ca listing page URL — add a "RealtorURL" column in
        // Airtable with the full https://www.realtor.ca/... link for
        // each listing. Cards without this filled in just render as
        // non-clickable, same as before.
        realtorUrl: f.RealtorURL ?? ''
      };
    });

    return {
      statusCode: 200,
      // Cache at the edge for a minute so repeat visits are fast and you
      // don't burn through Airtable's rate limit even under heavy traffic.
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
      body: JSON.stringify({ listings })
    };
  } catch (err) {
    console.error('Error fetching listings:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not load listings.' })
    };
  }
};