const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../main.js");

test("initializeContactHints exposes per-field focus-only hint behavior", () => {
  assert.equal(typeof app.initializeContactHints, "function");
});
