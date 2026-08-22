// Antiquarium — experiences/floating-archive/data.js
//
// The only file you need to touch to add, remove, or rearrange artwork
// in "The Floating Archive." index.js reads this array and hands each
// entry, plus a placement computed by constellation.js, to
// memory-star.js to build one Memory Star — nothing about an artwork is
// ever hard-coded into the scene-building code itself.
//
// HOW TO ADD AN ARTWORK
// ----------------------------------------------------------------------
// 1. Put the image file somewhere under Assets/ (see the note at the
//    bottom of this file for where new work specifically should go).
// 2. Add an object to the `artworks` array below:
//
//      {
//        title: "Name of the piece",
//        image: "../../Assets/Antiquarium/your-file.webp",
//        medium: "Digital composition",  // optional — shown on the inspector label
//        scale: 1.0,               // 1.0 = the archive's default plate size
//      }
//
// 3. Save the file. That's it — no other file needs to change. Where the
//    new entry actually appears in space is decided entirely by
//    constellation.js (see below), based on its position in this array —
//    the plate's on-screen size is `scale` multiplied by the image's own
//    aspect ratio, so portrait and landscape pieces both display without
//    stretching.
//
// If `image` 404s or is left as a placeholder, the plate still renders
// (core/placeholder-texture.js draws a gold-on-charcoal "Awaiting
// Acquisition" plate in its place) — nothing breaks while you're still
// sourcing the real file.
//
// ARCHITECTURE NOTE — spatial placement lives in constellation.js now
// ----------------------------------------------------------------------
// This manifest used to carry a literal, authored `position`/`rotation`
// per artwork (a fixed room layout). As of Stage 2, that's gone: every
// star's location is instead computed by constellation.js's
// starPlacementFor(index, totalCount) — a point along the endless,
// recurring constellation path, displaced into the volume around it.
// Reordering entries in this array reorders where they fall along that
// path; there is no longer a per-artwork position to hand-tune here.

export const artworks = [
  {
    title: "French Divinity",
    image: "../../Assets/Webp/WEBP of Traditional works/French Divinity _result.webp",
    medium: "Traditional composition",
    scale: 1.05,
  },
  {
    title: "Hayedeh",
    image: "../../Assets/Webp/WEBP of Digital works/Haydeh _result.webp",
    medium: "Digital composition",
    scale: 1.3,
  },
  {
    title: "Reza Shah",
    image: "../../Assets/Webp/WEBP of Traditional works/Reza Shah _result.webp",
    medium: "Traditional composition",
    scale: 0.82,
  },
  {
    title: "The Lions Of Iran",
    image: "../../Assets/Webp/WEBP of Digital works/Lions of Iran Ai version _result.webp",
    medium: "Digital composition",
    scale: 1.12,
  },
  {
    title: "Macron",
    image: "../../Assets/Webp/WEBP of Traditional works/Macron _result.webp",
    medium: "Traditional composition",
    scale: 1.45,
  },
  {
    title: "Yukio Mishima",
    image: "../../Assets/Webp/WEBP of Digital works/Yukio Mishima _result.webp",
    medium: "Digital composition",
    scale: 1.0,
  },

  // ---- Second wave (added 2026) ------------------------------------
  // Ten pieces pulled in from the Traditional/Digital/Cyborg Vaults and
  // the homepage's Featured Artworks, chosen to extend the three
  // threads the original six already hinted at rather than just
  // padding the room out — see the shortlist discussion in-repo for
  // the reasoning behind each pick.
  {
    title: "Mohammad Reza Shajarian",
    image: "../../Assets/Traditional Artworks/Mohammad Reza Shajarian .webp",
    medium: "Traditional composition",
    scale: 1.15,
  },
  {
    title: "Persepolis",
    image: "../../Assets/Webp/WEBP of Digital works/Persepolis .webp",
    medium: "Digital composition",
    scale: 1.0,
  },
  {
    title: "Naser Al-Din Shah Qajar",
    image: "../../Assets/Webp/WEBP of Digital works/Webp Second Round/Nasser Bio .webp",
    medium: "Digital composition",
    scale: 1.35,
  },
  {
    title: "Albert Camus",
    image: "../../Assets/Webp/WEBP of Digital works/Camus Ai .webp",
    medium: "Digital composition",
    scale: 0.78,
  },
  {
    title: "Charles Bukowski",
    image: "../../Assets/Webp/WEBP of Digital works/Bukowski Gladiator .webp",
    medium: "Digital composition",
    scale: 1.5,
  },
  {
    title: "Solzhenitsyn",
    image: "../../Assets/Webp/WEBP of Ink made works/Solzhenitsyn .webp",
    medium: "Traditional composition",
    scale: 0.88,
  },
  {
    title: "Oscar Wilde",
    image: "../../Assets/Webp/WEBP of Digital works/Oscar Wilde_ Copilot _result.webp",
    medium: "Digital composition",
    scale: 0.95,
  },
  {
    title: "Oppenheimer",
    image: "../../Assets/Webp/WEBP of Traditional works/Oppenheimer _result.webp",
    medium: "Traditional composition",
    scale: 0.8,
  },
  {
    title: "Marie Antoinette",
    image: "../../Assets/Webp/WEBP of Digital works/Marie _result.webp",
    medium: "Digital composition",
    scale: 1.55,
  },
  {
    title: "Guernica of Kave",
    image: "../../Assets/Webp/WEBP of Ink made works/Guernica of Kave .webp",
    medium: "Traditional composition",
    scale: 1.2,
  },
];

// New original work for this installation (as opposed to pieces already
// living elsewhere in Assets/) should go in Assets/Antiquarium/, e.g.
// Assets/Antiquarium/the-floating-archive/your-file.webp — that folder
// doesn't exist yet; create it the first time you add something there.
// Reusing an image already elsewhere in Assets/ (as the six above do)
// is equally fine — just point `image` at its existing path.
