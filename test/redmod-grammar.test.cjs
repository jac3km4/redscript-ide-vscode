const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { before, test } = require("node:test");
const { Registry, parseRawGrammar, INITIAL } = require("vscode-textmate");
const { loadWASM, OnigScanner, OnigString } = require("vscode-oniguruma");

const root = path.join(__dirname, "..");
const manifest = require("../package.json");
const contribution = manifest.contributes.grammars.find(g => g.language === "redmod");
let grammar;

before(async () => {
  await loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")));
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: patterns => new OnigScanner(patterns),
      createOnigString: text => new OnigString(text),
    }),
    loadGrammar: async scope => scope === contribution.scopeName
      ? parseRawGrammar(readFileSync(path.join(root, contribution.path), "utf8"), contribution.path)
      : null,
  });
  grammar = await registry.loadGrammar(contribution.scopeName);
  assert.ok(grammar);
});

function tokenize(source) {
  let state = INITIAL;
  return source.split("\n").map(line => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    return result.tokens.map(token => ({
      text: line.slice(token.startIndex, token.endIndex),
      scopes: token.scopes,
    }));
  });
}

function hasScope(tokens, text, scope) {
  assert.ok(tokens.some(t => t.text === text && t.scopes.includes(scope)),
    `Expected ${JSON.stringify(text)} in ${scope}: ${JSON.stringify(tokens)}`);
}

// Fixtures follow crates/syntax/redmod/parser's lexer.rs and parser/{native,expr}.rs.
test("separate language, activation, grammar and editing configuration are contributed", () => {
  const language = manifest.contributes.languages.find(l => l.id === "redmod");
  assert.deepEqual(language.extensions, [".script"]);
  assert.deepEqual(manifest.contributes.languages.find(l => l.id === "redscript").extensions, [".reds"]);
  assert.ok(manifest.activationEvents.includes("onLanguage:redmod"));
  assert.ok(manifest.activationEvents.includes("onLanguage:redscript"));
  assert.ok(!manifest.extensionDependencies?.includes("jackhumbert.redscript-syntax-highlighting"));
  const config = JSON.parse(readFileSync(path.join(root, language.configuration), "utf8"));
  assert.equal(config.comments.lineComment, "//");
  assert.deepEqual(config.comments.blockComment, ["/*", "*/"]);
  assert.ok(config.brackets.some(([open, close]) => open === "[" && close === "]"));
});

test("native declarations, modifiers, directives and annotations", () => {
  const lines = tokenize('@module "Example.Module"\n@using "Example.Other"\n@replaceMethod(Foo)\npublic importonly class Foo extends Bar {\n  override event OnEvent(optional out value: ref<Bar>) {}\n  implicit cast(): Int32;\n  default value = NULL;\n  hint value = "help";\n}');
  hasScope(lines[0], "@module", "keyword.control.directive.redmod");
  hasScope(lines[1], "@using", "keyword.control.directive.redmod");
  hasScope(lines[2], "@replaceMethod", "entity.name.function.annotation.redmod");
  hasScope(lines[3], "importonly", "storage.modifier.redmod");
  hasScope(lines[3], "Foo", "entity.name.type.redmod");
  hasScope(lines[4], "OnEvent", "entity.name.function.redmod");
  hasScope(lines[4], "optional", "storage.modifier.redmod");
  hasScope(lines[4], "ref", "support.type.redmod");
  hasScope(lines[5], "cast", "storage.type.redmod");
  hasScope(lines[6], "NULL", "constant.language.redmod");
  hasScope(lines[7], "hint", "keyword.other.redmod");
});

test("metadata, static arrays, control flow and native expressions", () => {
  const lines = tokenize('[Key = "value", Flag = true]\nvar values: Int32[4];\nfor (i = 0; i < 4; i += 1) { continue; }\ndo { this.value = new Foo; } while (false);\nreturn Cast<Int32>(super.Value()) as Int32;');
  hasScope(lines[0], "true", "constant.language.redmod");
  hasScope(lines[1], "4", "constant.numeric.redmod");
  hasScope(lines[2], "for", "keyword.control.redmod");
  hasScope(lines[2], "+=", "keyword.operator.redmod");
  hasScope(lines[3], "this", "variable.language.redmod");
  hasScope(lines[3], "new", "keyword.other.redmod");
  hasScope(lines[4], "Cast", "support.function.redmod");
  hasScope(lines[4], "as", "keyword.other.redmod");
});

test("decimal, leading-dot, exponent and signed numeric spellings", () => {
  for (const number of ["0", "42", "42l", ".5", "1.", "1.25f", "1e3", "2E-03d"]) {
    hasScope(tokenize(number)[0], number, "constant.numeric.redmod");
  }
  const tokens = tokenize("-42l + .5")[0];
  hasScope(tokens, "-", "keyword.operator.redmod");
  hasScope(tokens, "42l", "constant.numeric.redmod");
  hasScope(tokenize("item1 1u 1ul")[0], "item1", "variable.other.redmod");
  for (const t of tokenize("1u 1ul")[0]) {
    assert.ok(!t.scopes.includes("constant.numeric.redmod"));
  }
});

test("raw string forms and uppercase resource/TweakDB prefixes", () => {
  const tokens = tokenize(String.raw`"plain" n"name" R"path\file" T"Items.Test" 'Name'`)[0];
  for (const prefix of ["n", "R", "T"]) {
    hasScope(tokens, prefix, "storage.type.string.redmod");
  }
  hasScope(tokens, "Name", "string.quoted.single.redmod");
  assert.ok(tokens.every(t => !t.scopes.some(s => s.startsWith("constant.character.escape"))));
  const unsupported = tokenize('r"path" t"id" s"text"')[0];
  for (const prefix of ["r", "t", "s"]) {
    hasScope(unsupported, prefix, "variable.other.redmod");
  }
});

test("backslashes do not escape either string delimiter", () => {
  for (const quote of ['"', "'"]) {
    const tokens = tokenize(quote + "raw\\" + quote + " NULL")[0];
    hasScope(tokens, "NULL", "constant.language.redmod");
  }
});

test("multiline strings preserve comment-like contents and recover after closing", () => {
  const lines = tokenize('"start\n// not a comment /* neither */\nend" return true;');
  hasScope(lines[1], "// not a comment /* neither */", "string.quoted.double.redmod");
  hasScope(lines[2], "return", "keyword.control.redmod");
});

test("nested multiline block comments and line/doc comment boundaries", () => {
  const lines = tokenize('/* outer\n/* nested */ still outer\n*/ function Ready() {}\n/// docs\n//// ordinary\n// class Fake\nclass Real {}');
  assert.ok(lines[1].every(t => t.scopes.includes("comment.block.redmod")));
  hasScope(lines[2], "Ready", "entity.name.function.redmod");
  hasScope(lines[3], " docs", "comment.line.documentation.redmod");
  assert.ok(lines[4].every(t => t.scopes.includes("comment.line.double-slash.redmod")));
  assert.ok(lines[5].every(t => t.scopes.includes("comment.line.double-slash.redmod")));
  hasScope(lines[6], "Real", "entity.name.type.redmod");
});

test("keywords are case-sensitive and do not match identifier substrings", () => {
  for (const word of ["null", "True", "Class", "classification", "returnValue", "arraySize"]) {
    hasScope(tokenize(word)[0], word, "variable.other.redmod");
  }
});
