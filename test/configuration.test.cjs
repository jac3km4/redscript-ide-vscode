const assert = require("node:assert/strict");
const { test } = require("node:test");
const manifest = require("../package.json");

test("gameDir is contributed as an optional string setting", () => {
  const setting = manifest.contributes.configuration.properties["redscript.gameDir"];
  assert.ok(setting);
  assert.equal(setting.type, "string");
  assert.match(setting.description, /optional/i);
  assert.equal(setting.default, undefined);
});

test("script cache path is contributed as an optional string setting", () => {
  const setting = manifest.contributes.configuration.properties["redscript.scriptCachePath"];
  assert.ok(setting);
  assert.equal(setting.type, "string");
  assert.match(setting.description, /script cache file/);
  assert.equal(setting.default, undefined);
});
