// Antiquarium — experiences/floating-archive-data.js
//
// The only file you need to touch to add, remove, or rearrange artwork
// in "The Floating Archive." floating-archive.js reads this array and
// builds one holographic plate per entry — nothing about an artwork is
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
//        image: "../Assets/Antiquarium/your-file.webp",
//        medium: "Digital composition",  // optional — shown on the inspector label
//        position: [x, y, z],      // meters from the room's center
//        rotation: [x, y, z],      // radians, y is the usual "turn to face" axis
//        scale: 1.0,               // 1.0 = the archive's default plate size
//      }
//
// 3. Save the file. That's it — no other file needs to change. The
//    plate's actual on-screen size is this `scale` multiplied by the
//    image's own aspect ratio, so portrait and landscape pieces both
//    display without stretching.
//
// If `image` 404s or is left as a placeholder, the plate still renders
// (core/placeholder-texture.js draws a gold-on-charcoal "Awaiting
// Acquisition" plate in its place) — nothing breaks while you're still
// sourcing the real file.
//
// Positions are deliberately irregular — not a grid, not a circle of
// equal radius — so keep new entries similarly varied: mix which ones
// sit close to the camera (small |z|, larger scale) against which sit
// deep in the room (large negative z), and stagger x/y so nothing lines
// up with its neighbors.

export const artworks = [
  {
    title: "French Divinity",
    image: "../Assets/Webp/WEBP of Traditional works/French Divinity _result.webp",
    medium: "Traditional composition",
    position: [-3.3, 0.7, -1.6],
    rotation: [0, 0.36, 0],
    scale: 1.05,
  },
  {
    title: "Hayedeh",
    image: "../Assets/Webp/WEBP of Digital works/Haydeh _result.webp",
    medium: "Digital composition",
    position: [2.5, 1.5, -3.4],
    rotation: [0, -0.5, 0],
    scale: 1.3,
  },
  {
    title: "Reza Shah",
    image: "../Assets/Webp/WEBP of Traditional works/Reza Shah _result.webp",
    medium: "Traditional composition",
    position: [-1.5, -1.15, 1.9],
    rotation: [0, 0.16, 0],
    scale: 0.82,
  },
  {
    title: "The Lions Of Iran",
    image: "../Assets/Webp/WEBP of Digital works/Lions of Iran Ai version _result.webp",
    medium: "Digital composition",
    position: [3.7, -0.5, 0.3],
    rotation: [0, -0.26, 0],
    scale: 1.12,
  },
  {
    title: "Macron",
    image: "../Assets/Webp/WEBP of Traditional works/Macron _result.webp",
    medium: "Traditional composition",
    position: [0.5, 2.0, -4.7],
    rotation: [0, 0.05, 0],
    scale: 1.45,
  },
  {
    title: "Yukio Mishima",
    image: "../Assets/Webp/WEBP of Digital works/Yukio Mishima _result.webp",
    medium: "Digital composition",
    position: [-3.9, -0.25, -3.1],
    rotation: [0, 0.56, 0],
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
    image: "../Assets/Traditional Artworks/Mohammad Reza Shajarian .webp",
    medium: "Traditional composition",
    position: [5.2, 0.9, -2.2],
    rotation: [0, -0.4, 0],
    scale: 1.15,
  },
  {
    title: "Persepolis",
    image: "../Assets/Webp/WEBP of Digital works/Persepolis .webp",
    medium: "Digital composition",
    position: [-5.6, -0.8, -0.5],
    rotation: [0, 0.5, 0],
    scale: 1.0,
  },
  {
    title: "Naser Al-Din Shah Qajar",
    image: "../Assets/Webp/WEBP of Digital works/Webp Second Round/Nasser Bio .webp",
    medium: "Digital composition",
    position: [1.8, -1.8, -5.5],
    rotation: [0, -0.15, 0],
    scale: 1.35,
  },
  {
    title: "Albert Camus",
    image: "../Assets/Webp/WEBP of Digital works/Camus Ai .webp",
    medium: "Digital composition",
    position: [-2.2, 1.9, 2.4],
    rotation: [0, 0.28, 0],
    scale: 0.78,
  },
  {
    title: "Charles Bukowski",
    image: "../Assets/Webp/WEBP of Digital works/Bukowski Gladiator .webp",
    medium: "Digital composition",
    position: [4.6, 2.3, -5.8],
    rotation: [0, -0.5, 0],
    scale: 1.5,
  },
  {
    title: "Solzhenitsyn",
    image: "../Assets/Webp/WEBP of Ink made works/Solzhenitsyn .webp",
    medium: "Traditional composition",
    position: [-4.4, 1.3, 1.1],
    rotation: [0, 0.42, 0],
    scale: 0.88,
  },
  {
    title: "Oscar Wilde",
    image: "../Assets/Webp/WEBP of Digital works/Oscar Wilde_ Copilot _result.webp",
    medium: "Digital composition",
    position: [0.2, -2.1, -1.3],
    rotation: [0, -0.22, 0],
    scale: 0.95,
  },
  {
    title: "Oppenheimer",
    image: "../Assets/Webp/WEBP of Traditional works/Oppenheimer _result.webp",
    medium: "Traditional composition",
    position: [3.0, 0.2, 2.6],
    rotation: [0, 0.6, 0],
    scale: 0.8,
  },
  {
    title: "Marie Antoinette",
    image: "../Assets/Webp/WEBP of Digital works/Marie _result.webp",
    medium: "Digital composition",
    position: [-1.0, 0.5, -6.3],
    rotation: [0, -0.35, 0],
    scale: 1.55,
  },
  {
    title: "Guernica of Kave",
    image: "../Assets/Webp/WEBP of Ink made works/Guernica of Kave .webp",
    medium: "Traditional composition",
    position: [-5.9, -1.6, -3.6],
    rotation: [0, 0.15, 0],
    scale: 1.2,
  },
];

// New original work for this installation (as opposed to pieces already
// living elsewhere in Assets/) should go in Assets/Antiquarium/, e.g.
// Assets/Antiquarium/the-floating-archive/your-file.webp — that folder
// doesn't exist yet; create it the first time you add something there.
// Reusing an image already elsewhere in Assets/ (as the six above do)
// is equally fine — just point `image` at its existing path.
