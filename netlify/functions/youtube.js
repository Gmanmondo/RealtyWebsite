// netlify/functions/youtube.js
//
// Fetches your channel's latest uploads via the YouTube Data API v3
// and returns just the fields the tape track needs. The API key lives
// here as an environment variable and never reaches the browser.
//
// Set these in Netlify dashboard → Site configuration → Environment variables:
//   YOUTUBE_API_KEY      = AIzaSy...
//   YOUTUBE_PLAYLIST_ID  = UUxxxxxxxxxxxxxxxxxxxxxx   (your uploads playlist)
//
// Place this file at: netlify/functions/youtube.js

exports.handler = async function (event, context) {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  const PLAYLIST_ID = process.env.YOUTUBE_PLAYLIST_ID;
  const MAX_RESULTS = 12; // plenty for a scrolling tape, keeps payload small

  if (!API_KEY || !PLAYLIST_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing YouTube API configuration." }),
    };
  }

  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet&maxResults=${MAX_RESULTS}` +
    `&playlistId=${PLAYLIST_ID}&key=${API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error("YouTube API error:", errText);
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "YouTube API request failed." }),
      };
    }

    const data = await res.json();

    const videos = (data.items || [])
      // Skip private/deleted videos, which show up with placeholder snippets
      .filter(
        (item) =>
          item.snippet?.title !== "Private video" &&
          item.snippet?.title !== "Deleted video",
      )
      .map((item) => {
        const snippet = item.snippet;
        const videoId = snippet.resourceId?.videoId;
        return {
          videoId,
          title: snippet.title,
          publishedAt: snippet.publishedAt,
          // maxres isn't always available; fall back down the thumbnail chain
          thumbnailUrl:
            snippet.thumbnails?.maxres?.url ||
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        };
      });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache at the edge for 30 min — cuts quota use, keeps content fresh enough
        "Cache-Control": "public, max-age=1800",
      },
      body: JSON.stringify({ videos }),
    };
  } catch (err) {
    console.error("Could not fetch YouTube videos:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not fetch YouTube videos." }),
    };
  }
};