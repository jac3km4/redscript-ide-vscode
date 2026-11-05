# Development

Use Node.js 22 or newer for development and packaging (`@vscode/vsce` requires
Node 22+). CI uses Node 22. The minimum supported VS Code version is 1.91.0;
`@types/vscode` is pinned to that API version, Node types track its Node 20
extension host, and the bundle targets Node 20. Keep these constraints aligned
when upgrading runtime dependencies. Octokit 21 is retained for host compatibility.

## Validation

```sh
npm ci
npm test
npm run compile
npm run package
```

- `typecheck` checks TypeScript without emitting files.
- `build` bundles the extension and runtime dependencies into `out/extension.js`.
- `compile` runs typechecking followed by bundling.
- `package` creates a VSIX using the local vsce. Its `vscode:prepublish` hook runs
  `compile`, so standalone packaging cannot silently use an outdated bundle.
- `watch` rebuilds the bundle as source files change; run `typecheck` separately.

Inspect the generated VSIX as a ZIP archive. Under `extension/`, it should contain
only `package.json`, `readme.md`, `LICENSE.txt`, `out/extension.js`, both
`syntaxes/*.tmLanguage.json` grammars, and both language-configuration JSON files.
Tests, sources, workflows, lockfiles and `node_modules` must not be shipped.
The archive also contains VSIX metadata outside `extension/`.

For an extension-host smoke test, launch the extension with the checked-in VS Code
debug configuration. Test both `.reds` and `.script` files with a compatible local
server configured through `redscript.idePath`; grammar tests do not exercise LSP
or debugger integration.

## Dependency security

Run `npm audit` after dependency updates. Do not blindly use `npm audit fix --force`:
it can downgrade the packager or language client to obsolete major versions.

With vsce 4.1.0 and languageclient 11.0.0, the current audit reports three moderate
findings from their shared `minimatch` 10 dependency (GHSA-g3hv-75wg-m249).
The upstream ranges do not admit the patched minimatch 11 release. No high or
critical findings remain. Recheck upstream releases before adding a cross-major
override, and validate packaging and language-client behavior if one is needed.
