// netlify/functions/testimonials.js
// Netlify serverless function — runs on Netlify's server, never in the browser.
// The Google API key lives only here, as an environment variable, so it's
// never present in any code the visitor's browser can see.
//
// Uses Places API (New) — https://places.googleapis.com/v1/places/{id} —
// which is Google's current recommended Places API. Set these in Netlify
// dashboard → Site configuration → Environment variables, then redeploy:
//   GOOGLE_PLACES_API_KEY = AIzaSy...
//   GOOGLE_PLACE_ID        = ChIJ...   (find yours by searching your
//                                       business at https://developers.google.com/maps/documentation/places/web-service/place-id)
//
// Note: Google only ever returns up to 5 reviews per place through this
// API, no matter how many the business actually has on Google — that's a
// fixed limit on Google's end, not something this function controls.

exports.handler = async function () {
  const { GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID } = process.env;

  if (!GOOGLE_PLACES_API_KEY || !GOOGLE_PLACE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Google Places environment variables are not configured.' })
    };
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${GOOGLE_PLACE_ID}`;

    const placesRes = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        // FieldMask keeps the request (and its cost) limited to only
        // what this site actually needs.
        'X-Goog-FieldMask': 'reviews'
      }
    });

    if (!placesRes.ok) {
      return {
        statusCode: placesRes.status,
        body: JSON.stringify({ error: `Google Places responded ${placesRes.status}` })
      };
    }

    const data = await placesRes.json();

    // Only pass through the fields the site actually needs — keeps the
    // response minimal and avoids leaking anything extra (Google also
    // includes things like the reviewer's profile photo URL and a link
    // back to their Google profile, which this site doesn't use).
    const testimonials = (data.reviews || []).map(review => ({
      name: review.authorAttribution?.displayName || 'Anonymous',
      text: review.text?.text || review.originalText?.text || '',
      rating: review.rating ?? null
    }));

    return {
      statusCode: 200,
      // Cache at the edge for an hour — reviews don't change minute to
      // minute, so there's no reason to call Google on every visit.
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
      body: JSON.stringify({ testimonials })
    };
  } catch (err) {
    console.error('Error fetching testimonials:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not load testimonials.' })
    };
  }
};