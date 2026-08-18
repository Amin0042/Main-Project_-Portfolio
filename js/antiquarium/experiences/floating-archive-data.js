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
];

// New original work for this installation (as opposed to pieces already
// living elsewhere in Assets/) should go in Assets/Antiquarium/, e.g.
// Assets/Antiquarium/the-floating-archive/your-file.webp — that folder
// doesn't exist yet; create it the first time you add something there.
// Reusing an image already elsewhere in Assets/ (as the six above do)
// is equally fine — just point `image` at its existing path.
