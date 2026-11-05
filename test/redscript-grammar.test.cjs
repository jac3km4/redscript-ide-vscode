const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { before, test } = require("node:test");
const { Registry, parseRawGrammar, INITIAL } = require("vscode-textmate");
const { loadWASM, OnigScanner, OnigString } = require("vscode-oniguruma");

const root = path.join(__dirname, "..");
const manifest = require("../package.json");
const contribution = manifest.contributes.grammars.find(g => g.language === "redscript");
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

// Fixtures follow crates/syntax/community/parser/src/{lexer,parser,parser/*}.rs.
test("community grammar and separate editing configuration replace the external dependency", () => {
  const language = manifest.contributes.languages.find(l => l.id === "redscript");
  const redmod = manifest.contributes.languages.find(l => l.id === "redmod");
  assert.deepEqual(language.extensions, [".reds"]);
  assert.equal(contribution.scopeName, "source.redscript");
  assert.ok(manifest.activationEvents.includes("onLanguage:redscript"));
  assert.ok(!manifest.extensionDependencies?.includes("jackhumbert.redscript-syntax-highlighting"));
  assert.notEqual(language.configuration, redmod.configuration);
  const config = JSON.parse(readFileSync(path.join(root, language.configuration), "utf8"));
  assert.equal(config.comments.lineComment, "//");
  assert.deepEqual(config.comments.blockComment, ["/*", "*/"]);
  assert.deepEqual(config.brackets, [["{", "}"], ["[", "]"], ["(", ")"]]);
  assert.ok(config.autoClosingPairs.some(p => p.open === '"' && p.notIn.includes("string")));
  assert.ok(!config.autoClosingPairs.some(p => p.open === "'"));
  assert.ok(!config.surroundingPairs.some(([open]) => open === "'"));
});

test("modules, all import forms, declarations and annotations", () => {
  const lines = tokenize('module Example.Main\nimport Std.*\nimport Something.{Test1, Test2}\nimport Exact.Path\n@replaceMethod(Foo)\npublic native class Box<T> extends Base<T> {\n  let value: T;\n  func Get() -> T = this.value\n}\nstruct Data {}\nenum Mode: Int32 { Ready = 1 }\nimplicit func Convert() -> Int32 = 1\nfunc operator[](index: Int32) -> Int32 = index');
  for (let i = 0; i < 4; i++) {
    hasScope(lines[i], i === 0 ? "module" : "import", "keyword.control.import.redscript");
  }
  hasScope(lines[4], "@replaceMethod", "entity.name.function.annotation.redscript");
  hasScope(lines[5], "Box", "entity.name.type.redscript");
  hasScope(lines[5], "extends", "keyword.other.redscript");
  hasScope(lines[6], "let", "storage.type.redscript");
  hasScope(lines[7], "Get", "entity.name.function.redscript");
  hasScope(lines[7], "this", "variable.language.redscript");
  hasScope(lines[9], "Data", "entity.name.type.redscript");
  hasScope(lines[10], "Mode", "entity.name.type.redscript");
  hasScope(lines[11], "implicit", "storage.modifier.redscript");
  hasScope(lines[12], "operator", "entity.name.function.redscript");
});

test("community item, parameter and conversion qualifiers", () => {
  for (const word of ["public", "private", "protected", "abstract", "cb", "const", "editable", "exec", "final", "importonly", "instanceeditable", "inlined", "native", "persistent", "quest", "replicated", "static", "testonly", "opt", "out", "skip", "explicit", "implicit"]) {
    hasScope(tokenize(word)[0], word, "storage.modifier.redscript");
  }
  const tokens = tokenize("func Probe(opt out value: ref<Foo>) -> const Int32;")[0];
  hasScope(tokens, "Probe", "entity.name.function.redscript");
  hasScope(tokens, "opt", "storage.modifier.redscript");
  hasScope(tokens, "ref", "support.type.redscript");
});

test("generics, arrays, function types and typed/block lambdas remain code", () => {
  const lines = tokenize('class Box<+T extends Base, -U> {}\nfunc Map<T>(values: [T; 4], mapper: (T) -> T) -> array<T> {}\nlet map = (value: Int32) -> value + 1;\nlet block = (value) -> { return value; };\nfor item in values { if let found = item as Foo { continue; } }\nwhile true { break; }\nswitch value { case null: return; default: return new Foo(); }');
  hasScope(lines[0], "+", "keyword.operator.redscript");
  hasScope(lines[0], "extends", "keyword.other.redscript");
  hasScope(lines[1], "Map", "entity.name.function.redscript");
  hasScope(lines[1], "4", "constant.numeric.redscript");
  hasScope(lines[1], "array", "support.type.redscript");
  hasScope(lines[2], "->", "keyword.operator.redscript");
  hasScope(lines[2], "Int32", "support.type.redscript");
  hasScope(lines[3], "return", "keyword.control.redscript");
  for (const word of ["for", "in", "if", "continue"]) {
    hasScope(lines[4], word, "keyword.control.redscript");
  }
  hasScope(lines[5], "while", "keyword.control.redscript");
  hasScope(lines[6], "null", "constant.language.redscript");
  hasScope(lines[6], "new", "keyword.other.redscript");
});

test("decimal numeric types and signed minimum magnitudes", () => {
  for (const number of ["0", "42", "42u", "42l", "42ul", "1.", "1.25", "1.25d", "1d", "1e3d", "2.0E-03", "2.0e+003d", "2147483648", "9223372036854775808l", "18446744073709551615ul"]) {
    hasScope(tokenize(number)[0], number, "constant.numeric.redscript");
  }
  const tokens = tokenize("-2147483648 -9223372036854775808l")[0];
  hasScope(tokens, "-", "keyword.operator.redscript");
  hasScope(tokens, "2147483648", "constant.numeric.redscript");
  hasScope(tokens, "9223372036854775808l", "constant.numeric.redscript");
  for (const number of [".5", "1f", "1e3", "0xFF", "1UL", "1.5u", "01"]) {
    assert.ok(tokenize(number)[0].every(t => !t.scopes.includes("constant.numeric.redscript")), number);
  }
});

test("all community literal prefixes share escaped quotes, backslashes and Unicode escapes", () => {
  for (const prefix of ["", "n", "r", "t", "s"]) {
    const tokens = tokenize(prefix + String.raw`"start\"middle\\\n\r\t\'\u{1F600}end" null`)[0];
    if (prefix) hasScope(tokens, prefix, "storage.type.string.redscript");
    for (const escape of [String.raw`\"`, String.raw`\\`, String.raw`\n`, String.raw`\r`, String.raw`\t`, String.raw`\'`, String.raw`\u{1F600}`]) {
      hasScope(tokens, escape, "constant.character.escape.redscript");
    }
    hasScope(tokens, "null", "constant.language.redscript");
  }
  hasScope(tokenize(String.raw`"bad\q"`)[0], String.raw`\q`, "invalid.illegal.escape.redscript");
  const unsupported = tokenize('R"path" T"id" \'name\'')[0];
  for (const word of ["R", "T", "name"]) hasScope(unsupported, word, "variable.other.redscript");
  assert.ok(unsupported.every(t => !t.scopes.includes("string.quoted.single.redscript")));
});

test("interpolation balances nested calls and returns to string then code", () => {
  const tokens = tokenize(String.raw`s"before \(Call((1 + 2), other(3))) after" null`)[0];
  hasScope(tokens, String.raw`\(`, "punctuation.section.interpolation.begin.redscript");
  hasScope(tokens, "Call", "meta.embedded.line.redscript");
  hasScope(tokens, "1", "constant.numeric.redscript");
  hasScope(tokens, "other", "variable.other.redscript");
  hasScope(tokens, ")", "punctuation.section.interpolation.end.redscript");
  hasScope(tokens, " after", "string.quoted.double.interpolated.redscript");
  hasScope(tokens, "null", "constant.language.redscript");
  assert.ok(tokens.filter(t => t.text === "null").every(t => !t.scopes.includes("meta.interpolation.redscript")));
});

test("nested and multiline interpolation preserves state through strings and comments", () => {
  const lines = tokenize(String.raw`s"outer \(s"inner \(value)") \(
  /* outer /* nested */ still comment */ Call(1)
) done" return true;`);
  assert.equal(lines[0].filter(t => t.scopes.includes("punctuation.section.interpolation.begin.redscript")).length, 3);
  hasScope(lines[0], "value", "variable.other.redscript");
  hasScope(lines[1], "Call", "meta.embedded.line.redscript");
  hasScope(lines[2], " done", "string.quoted.double.interpolated.redscript");
  hasScope(lines[2], "return", "keyword.control.redscript");
});

test("escaped interpolation stays literal and ordinary strings do not interpolate", () => {
  for (const source of [String.raw`s"literal \\(value)" null`, String.raw`"literal \(value)" null`, String.raw`n"literal \(value)" null`, String.raw`r"literal \(value)" null`, String.raw`t"literal \(value)" null`]) {
    const tokens = tokenize(source)[0];
    assert.ok(tokens.every(t => !t.scopes.includes("meta.interpolation.redscript")));
    hasScope(tokens, "null", "constant.language.redscript");
  }
});

test("multiline strings preserve comment-like contents", () => {
  const lines = tokenize('"start\n// not a comment /* neither */\nend" return true;');
  hasScope(lines[1], "// not a comment /* neither */", "string.quoted.double.redscript");
  hasScope(lines[2], "return", "keyword.control.redscript");
});

test("nested block comments, documentation and ordinary line comments", () => {
  const lines = tokenize('/* outer\n/* nested */ still outer\n*/ func Ready() {}\n/// docs\n//// ordinary\n// class Fake\nclass Real {}');
  assert.ok(lines[1].every(t => t.scopes.includes("comment.block.redscript")));
  hasScope(lines[2], "Ready", "entity.name.function.redscript");
  hasScope(lines[3], " docs", "comment.line.documentation.redscript");
  assert.ok(lines[4].every(t => t.scopes.includes("comment.line.double-slash.redscript")));
  assert.ok(lines[5].every(t => t.scopes.includes("comment.line.double-slash.redscript")));
  hasScope(lines[6], "Real", "entity.name.type.redscript");
});

test("keywords are case-sensitive and native-only words remain identifiers", () => {
  for (const word of ["NULL", "True", "Class", "classification", "returnValue", "nullValue", "function", "event", "var", "optional", "do", "hint"]) {
    hasScope(tokenize(word)[0], word, "variable.other.redscript");
  }
  for (const word of ["null", "true", "false"]) {
    hasScope(tokenize(word)[0], word, "constant.language.redscript");
  }
});
