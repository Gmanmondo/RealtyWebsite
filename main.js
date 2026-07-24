// main.js
// All page behaviour for At Home With Dallas, in one file so the site
// only needs a single extra request beyond the HTML and CSS. Loaded
// with `defer` on the <script> tag in index.html, so it downloads in
// parallel with the page but only runs once the HTML has finished
// parsing, and always in document order (safe even though this file
// itself has no other scripts to run after).

// Watches an element until it scrolls into view, then runs a callback
// once and stops watching — the shared shape behind every scroll-
// triggered reveal on this page (photos, the contact heading, and
// later the listings cards).
function revealOnScroll(target, threshold, onReveal) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          onReveal(entry.target);
          observer.disconnect();
        }
      });
    },
    { threshold },
  );
  observer.observe(target);
}

const fp = document.getElementById("featurePhoto");
revealOnScroll(fp, 0.2, (el) => el.classList.add("in-view"));

const portraitFrame = document.getElementById("portraitFrame");
const aboutSection = document.querySelector(".aboutMe");
revealOnScroll(aboutSection, 0.2, () => portraitFrame.classList.add("revealed"));

// The tall-frame photo lives in the contact section, far down the
// page from aboutMe — it gets its own observer watching itself
// directly, so its reveal fires when it actually scrolls into view.
const tallFrame = document.getElementById("tallFrame");
revealOnScroll(tallFrame, 0.2, (el) => el.classList.add("revealed"));

// Typewriter heading in the contact section — starts typing only once
// it scrolls into view. anim-typewriter isn't in its class list at
// page load; adding it here is what actually starts the CSS animation.
const contactHeadingTypewriter = document.getElementById("contactHeadingTypewriter");
revealOnScroll(contactHeadingTypewriter, 0.2, (el) => el.classList.add("anim-typewriter"));

/* =========================================================
     FEATURED LISTINGS — powered by Airtable via a secure proxy
     -----------------------------------------------------
     The browser never talks to Airtable directly and never sees
     your Airtable token. Instead it calls /api/listings, which
     netlify.toml redirects to a small serverless function (see
     /netlify/functions/listings.js) that runs on Netlify's
     servers. The token lives there as an environment variable —
     set it in your Netlify project:

 Netlify dashboard → your site → Site configuration →
 Environment variables → add:
   AIRTABLE_BASE_ID   = appXXXXXXXXXXXXXX
   AIRTABLE_TABLE     = Listings
   AIRTABLE_TOKEN     = patXXXXXXXXXXXXXX...

     Redeploy after adding them. Your Airtable table should have
     these columns: Price, Address, Beds, Baths, SqFt, Status,
     MLSNumber, Photo (attachment), Order (number, for sorting),
     RealtorURL (the listing's realtor.ca link — paste it in per
     listing; leave it blank and that card just won't be clickable).
     ========================================================= */

const track = document.getElementById("listingsTrack");
const status = document.getElementById("listingsStatus");

async function loadListings() {
  try {
    const res = await fetch("/api/listings");
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    renderListings(data.listings || []);
  } catch (err) {
    console.error("Could not load listings:", err);
    status.textContent =
      "Listings couldn't be loaded right now — please check back shortly.";
  }
}

function renderListings(listings) {
  if (listings.length === 0) {
    status.textContent =
      "No active listings at the moment — check back soon.";
    return;
  }

  track.innerHTML = "";

  listings.forEach((listing) => {
    const price =
      typeof listing.price === "number"
        ? listing.price.toLocaleString("en-US", {
            style: "currency",
            currency: "CAD",
            maximumFractionDigits: 0,
          })
        : listing.price || "";

    const hasLink = Boolean(listing.realtorUrl);
    const card = document.createElement(hasLink ? "a" : "article");
    card.className = "listing-card";
    if (hasLink) {
      card.href = listing.realtorUrl;
      card.target = "_blank";
      card.rel = "noopener";
    }
    card.innerHTML = `
  <div class="reveal-mask"></div>
  <div class="listing-photo">
    <span class="status-tag">${listing.status}</span>
    <img src="${listing.photoUrl}" alt="${listing.address || "Listing photo"}">
  </div>
  <div class="listing-info">
    <p class="listing-price">${price}</p>
    <p class="listing-address">${listing.address}</p>
    <p class="listing-meta">${listing.beds ?? "–"} beds · ${listing.baths ?? "–"} baths · ${listing.sqft} sqft</p>
    <p class="listing-id">#${listing.mlsNumber}</p>
  </div>
`;
    track.appendChild(card);
  });

  setupScrollArrows();
  setupRevealAnimation();
}

function setupScrollArrows() {
  const step = () =>
    track.querySelector(".listing-card").offsetWidth + 24;
  document.getElementById("scrollLeft").addEventListener("click", () => {
    track.scrollBy({ left: -step(), behavior: "smooth" });
  });
  document.getElementById("scrollRight").addEventListener("click", () => {
    track.scrollBy({ left: step(), behavior: "smooth" });
  });
}

function setupRevealAnimation() {
  const cards = document.querySelectorAll(".listing-card");
  cards.forEach((card, i) => {
    card.querySelector(".reveal-mask").style.transitionDelay =
      `${i * 0.12}s`;
  });

  // Watch the section as a whole — fires once, the moment the row first
  // scrolls into view. All cards reveal together on that single trigger,
  // so scrolling the row horizontally afterward never re-triggers anything.
  const section = document.querySelector(".listings");
  revealOnScroll(section, 0.15, () => {
    cards.forEach((card) => card.classList.add("revealed"));
  });
}

loadListings();

/* =========================================================
     TESTIMONIALS — powered by Google Places via a secure proxy
     -----------------------------------------------------
     The browser never talks to Google directly and never sees your
     API key. Instead it calls /api/testimonials, which netlify.toml
     redirects to a small serverless function (see
     /netlify/functions/testimonials.js) that runs on Netlify's
     servers. The key lives there as an environment variable — set
     it in your Netlify project:

 Netlify dashboard → your site → Site configuration →
 Environment variables → add:
   GOOGLE_PLACES_API_KEY = AIzaSy...
   GOOGLE_PLACE_ID        = ChIJ...

     Redeploy after adding them. Google only ever returns up to 5
     reviews per place through this API — that's a fixed limit on
     Google's end, not something this code can change.

     No reveal animation on these cards yet — that's for later.
     ========================================================= */

const testimonialsTrack = document.getElementById("testimonialsTrack");
const testimonialsStatus = document.getElementById("testimonialsStatus");

// Review text and reviewer names are public, user-submitted content
// from Google — unlike the Airtable/YouTube data elsewhere on this
// page, this isn't something we control, so it gets escaped before
// going into innerHTML rather than interpolated directly.
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function loadTestimonials() {
  try {
    const res = await fetch("/api/testimonials");
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    renderTestimonials(data.testimonials || []);
  } catch (err) {
    console.error("Could not load testimonials:", err);
    testimonialsStatus.textContent =
      "Testimonials couldn't be loaded right now — please check back shortly.";
  }
}

function renderTestimonials(testimonials) {
  if (testimonials.length === 0) {
    testimonialsStatus.textContent = "No reviews to show yet.";
    return;
  }

  testimonialsTrack.innerHTML = "";

  testimonials.forEach((testimonial) => {
    const filledStars = Math.round(testimonial.rating || 0);
    const stars = "★".repeat(filledStars) + "☆".repeat(5 - filledStars);

    const card = document.createElement("article");
    card.className = "testimonial-card";
    card.innerHTML = `
  <div class="testimonial-stars" aria-label="${filledStars} out of 5 stars">${stars}</div>
  <p class="testimonial-text">"${escapeHtml(testimonial.text)}"</p>
  <p class="testimonial-name">— ${escapeHtml(testimonial.name)}</p>
`;
    testimonialsTrack.appendChild(card);
  });

  setupTestimonialsScrollArrows();
}

function setupTestimonialsScrollArrows() {
  const step = () =>
    testimonialsTrack.querySelector(".testimonial-card").offsetWidth + 24;
  document.getElementById("testimonialsScrollLeft").addEventListener("click", () => {
    testimonialsTrack.scrollBy({ left: -step(), behavior: "smooth" });
  });
  document.getElementById("testimonialsScrollRight").addEventListener("click", () => {
    testimonialsTrack.scrollBy({ left: step(), behavior: "smooth" });
  });
}

loadTestimonials();

/* =========================================================
   SOCIALS TAPE ENGINE
   -----------------------------------------------------
   Drives the continuous scroll for the YouTube .tape-column
   via real scrollLeft (not a CSS animation), and hands
   control over to native wheel/touch/momentum scrolling on
   that exact same property with no fighting between the two.

   Speed eases toward a target every frame rather than
   snapping — that single mechanism gives both the slow-stop
   on hover and the slow-start on resume for free.

   A single native 'scroll' listener is the one source of
   truth for "did the user scroll this" — it fires the same
   way for wheel, trackpad momentum, touch drag, and
   scrollbar dragging, so there's no separate wheel/touch
   logic that can fight the animation loop or each other.

   data-direction="right" means the cards visually drift from
   left to right — which means scrollLeft decreases each frame
   (moving the viewport backward reveals content sliding right).
   data-direction="left" would do the reverse, a standard
   ticker-style right-to-left drift, for future use.

   Content inside .tape-track should be tripled (three
   identical sets of cards) so there's a buffer to scroll into
   before the loop has to silently wrap.

   initTapeColumn expects the tripled cards to already be in
   the DOM when it's called — for YouTube that means waiting
   on the API response first (see loadYouTubeTape below).
   ========================================================= */
function initTapeColumn(column){
  const track = column.querySelector('.tape-track');
  if(!track) return;

  // 'right' = cards drift left→right on screen = scrollLeft decreases
  const directionSign = column.dataset.direction === 'left' ? 1 : -1;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_SPEED = prefersReducedMotion ? 0 : 0.5;  // px per frame, full auto-scroll pace
  const RESUME_DELAY = 1500;    // ms after leaving before auto-scroll starts easing back in
  const EASE = 0.05;            // how quickly speed eases toward its target each frame

  const setCount = 3;
  const setWidth = track.scrollWidth / setCount;
  let scrollPos = setWidth;     // our own float tracker — never rounded, unlike DOM scrollLeft
  column.scrollLeft = scrollPos; // start centred in the middle copy

  let targetSpeed = MAX_SPEED;
  let currentSpeed = MAX_SPEED;
  let resumeTimer = null;

  // True only for the instant we ourselves write column.scrollLeft, so the
  // 'scroll' handler below can tell "we did that" apart from "the user did that".
  let isAutoScroll = false;

  function writeScrollLeft(){
    isAutoScroll = true;
    column.scrollLeft = scrollPos;
  }

  function wrap(){
    if(scrollPos < setWidth * 0.5){
      scrollPos += setWidth;
      writeScrollLeft();
    }else if(scrollPos > setWidth * 1.5){
      scrollPos -= setWidth;
      writeScrollLeft();
    }
  }

  function pause(){
    targetSpeed = 0;
    currentSpeed = 0; // stop instantly so it can't fight the user's own scrolling
    if(resumeTimer){ clearTimeout(resumeTimer); resumeTimer = null; }
  }

  function scheduleResume(){
    if(resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(()=>{
      targetSpeed = MAX_SPEED;
      resumeTimer = null;
    }, RESUME_DELAY);
  }

  function tick(){
    currentSpeed += (targetSpeed - currentSpeed) * EASE;
    if(Math.abs(currentSpeed) > 0.002){
      scrollPos += directionSign * currentSpeed;
      wrap();
      writeScrollLeft();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---- Single source of truth for ALL user-driven scrolling: wheel,
  // trackpad momentum, touch drag, and scrollbar drag all fire this the
  // same way, so there's no separate touch/wheel logic to fight itself ----
  column.addEventListener('scroll', ()=>{
    if(isAutoScroll){
      isAutoScroll = false; // this write was ours, ignore it
      return;
    }
    // A real, user-driven scroll happened: stop the animation immediately
    // and resync our tracker to wherever the user actually left it.
    pause();
    scrollPos = column.scrollLeft;
    wrap();
    scheduleResume();
  }, {passive:true});

  // ---- Desktop: hover eases to a stop, native wheel/trackpad
  // scroll just works because the column is a real scrollable element ----
  column.addEventListener('mouseenter', pause);
  column.addEventListener('mouseleave', scheduleResume);

  track.addEventListener('click', (e)=>{
    const card = e.target.closest('.tape-card');
    if(card && card.dataset.url){
      window.open(card.dataset.url, '_blank', 'noopener');
    }
  });
}

/* =========================================================
   YOUTUBE FEED — powered by the YouTube Data API v3 via a
   secure proxy (same pattern as the Airtable listings above:
   the browser calls /api/youtube, which netlify.toml redirects
   to /netlify/functions/youtube.js. The API key lives there as
   an environment variable and never reaches the browser.

     Netlify dashboard → your site → Site configuration →
     Environment variables → add:
       YOUTUBE_API_KEY     = AIzaSy...
       YOUTUBE_PLAYLIST_ID = UUxxxxxxxxxxxxxxxxxxxxxx

   (Your uploads playlist ID is your channel ID with the
   leading "UC" swapped for "UU".) Redeploy after adding them.
   ========================================================= */

async function loadYouTubeTape() {
  const youtubeColumn = document.getElementById("youtubeTape");
  const youtubeTrackEl = document.getElementById("youtubeTrack");
  if (!youtubeColumn || !youtubeTrackEl) return;

  try {
    const res = await fetch("/api/youtube");
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    const videos = data.videos || [];

    if (videos.length === 0) {
      youtubeTrackEl.innerHTML =
        '<p class="tape-placeholder">No videos found right now.</p>';
      return;
    }

    renderYouTubeCards(youtubeColumn, youtubeTrackEl, videos);
  } catch (err) {
    console.error("Could not load YouTube videos:", err);
    youtubeTrackEl.innerHTML =
      '<p class="tape-placeholder">Videos couldn\'t be loaded right now.</p>';
  }
}

function formatPublishedDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildYouTubeCardHTML(video) {
  return `
<button type="button" class="tape-card" data-url="${video.url}">
  <div class="tape-thumb" style="background-image:url('${video.thumbnailUrl}');background-size:cover;background-position:center;"></div>
  <div class="tape-info">
    <p class="tape-title">${video.title}</p>
    <p class="tape-date">${formatPublishedDate(video.publishedAt)}</p>
  </div>
</button>
    `;
}

function renderYouTubeCards(column, trackEl, videos) {
  const oneSetHTML = videos.map(buildYouTubeCardHTML).join("");

  // Tripled so initTapeColumn has its scroll-wrap buffer, same as
  // the static markup used to provide by hand.
  trackEl.innerHTML = oneSetHTML + oneSetHTML + oneSetHTML;

  const cards = trackEl.querySelectorAll(".tape-card");
  cards.forEach((card, i) => {
    if (i >= videos.length) {
      card.setAttribute("tabindex", "-1");
      card.setAttribute("aria-hidden", "true");
    }
  });

  initTapeColumn(column);
}

loadYouTubeTape();

/* =========================================================
   CONTACT FORM — still a real Netlify Forms submission (the
   data-netlify="true" attribute on the <form> is what tells
   Netlify to detect and store it at deploy time), but sent via
   fetch() instead of a native page POST so the browser never
   navigates away.

   NOTE: Netlify Forms only work once the site is actually
   deployed — Netlify detects forms by scanning the built HTML
   at deploy time and processes submissions through its
   production edge network. Running this locally via
   `netlify dev` will always fail here (that's expected), since
   dev doesn't replicate that pipeline. To test for real, either
   deploy the site (`netlify deploy --prod`) or push a preview
   deploy (`netlify deploy`, no --prod flag) and test on that URL.
   ========================================================= */
const contactForm = document.getElementById("contactForm");

// Netlify Forms expects a standard urlencoded body, same shape
// a native form POST would send.
function encodeFormData(form){
  return new URLSearchParams(new FormData(form)).toString();
}

async function handleContactSubmit(e){
  e.preventDefault();

  const submitBtn = contactForm.querySelector(".contact-submit");
  const originalLabel = submitBtn ? submitBtn.textContent : "";
  if(submitBtn){
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
  }

  try {
    const res = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeFormData(contactForm),
    });

    if(!res.ok) throw new Error(`Server responded ${res.status}`);

    contactForm.reset();
  } catch (err) {
    console.error("Contact form submission failed:", err);
  } finally {
    if(submitBtn){
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }
}

if(contactForm){
  contactForm.addEventListener("submit", handleContactSubmit);
}