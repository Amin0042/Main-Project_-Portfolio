// Antiquarium — core/i18n.js
//
// The site-wide EN/پ switch lives in the root main.js, which marks
// Persian mode with body.lang-fa and fires a "languagechange" event on
// document whenever it flips. Antiquarium text is built in JavaScript,
// not tagged with data-i18n in the HTML, so the data files carry their
// Persian alongside the English as `<field>_fa` (the same convention as
// posts/index.json) and everything here reads through pick().

export function isPersian() {
  return document.body.classList.contains("lang-fa");
}

// pick(entry, "title") → entry.title_fa in Persian mode when it exists,
// otherwise entry.title.
export function pick(entry, field) {
  if (!entry) {
    return "";
  }
  if (isPersian() && entry[`${field}_fa`]) {
    return entry[`${field}_fa`];
  }
  return entry[field] || "";
}

export function tr(english, persian) {
  return isPersian() ? persian : english;
}

export function onLanguageChange(callback) {
  document.addEventListener("languagechange", callback);
  return () => document.removeEventListener("languagechange", callback);
}
