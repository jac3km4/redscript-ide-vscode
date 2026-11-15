# redscript-ide-vscode

VS Code extension for REDscript, client for [the REDscript IDE](https://github.com/jac3km4/redscript-ide).

## installation

This extension can be installed from the [VSCode marketplace](https://marketplace.visualstudio.com/items?itemName=jac3km4.redscript-ide-vscode).

<img src="https://github.com/jac3km4/redscript/assets/11986158/04dc3c66-fd1b-4198-b365-8875e850c602"  width="240" />

Optionally, you can provide the game installation path (`redscript.gameDir`) in preferences to load game scripts and enable debugger support:

<img src="https://user-images.githubusercontent.com/11986158/189502554-4feb3761-5b28-4db7-a459-66754eed6227.png" width="560" />

## features

- error and warning diagnostics
- autocompletion for methods and fields
- hover for function definitions and types
- go-to-definition
  - REDmod `.script` support with a compatible language server (see below)
- workspace symbols
- formatting (beta)
- debugger (requires [redscript-dap](https://github.com/jac3km4/redscript-dap))
- hooks for external tools

![ide-gif](https://user-images.githubusercontent.com/11986158/135734766-b5423e2c-cf47-4836-97ba-5c771cef7cf2.gif)

## syntax highlighting

Syntax highlighting and comment, bracket, and quote editing configuration are
bundled for both languages; no separate syntax-highlighting extension is required.
`.reds` files use the `redscript` language. Its basic TextMate grammar follows
`redscript/crates/syntax/community/parser` in the compiler repository: `func`/`let`
declarations, modules and imports, annotations and qualifiers, generic and function
type syntax, lambdas, lowercase `null`, decimal numbers (including `u`, `l`, `ul`,
and `d` suffixes), and nested block comments. Double-quoted strings support escapes
and lowercase `n`/`r`/`t` prefixes; `s"..."` additionally supports `\(expression)`
interpolation. Single-quoted strings and REDmod's uppercase `R`/`T` prefixes are
not community literal forms. Highlighting is lexical, not a parser or semantic
validator (for example, it does not check numeric ranges or type correctness).

## REDmod support

`.script` files use the separate `redmod` language, with its own bundled basic
TextMate grammar and editing configuration. Both languages activate the same
language server; file watching covers both extensions. Remove any old
`"*.script": "redscript"` override from `files.associations` to use the REDmod grammar.

The grammar follows the native REDmod lexer/parser in
`redscript/crates/syntax/redmod/parser`: declarations and modifiers, metadata,
annotations, `@module`/`@using`, control flow, type constructors, decimal numeric
literals, nested comments, and raw strings (`"..."`, `'...'`, `n"..."`, `R"..."`,
`T"..."`). Backslashes do not escape quotes. It is basic lexical highlighting,
not a parser or semantic validator; it does not add community interpolation or
lowercase resource/TweakDB prefixes to REDmod.

Language features require a **new REDmod-capable REDscript IDE server**. To test
a local build rather than the automatically downloaded release, set the existing
`redscript.idePath` setting to the absolute path of the new executable, alongside
`redscript.gameDir`, then reload VS Code. For example on Windows:

```json
{
  "redscript.gameDir": "C:\\Games\\Cyberpunk 2077",
  "redscript.idePath": "C:\\dev\\redscript-ide\\target\\release\\redscript-ide.exe"
}
```

The server's REDmod implementation is a strict, partial subset, not an official
compiler replacement. Supported code can use diagnostics, hover, member
completion, definitions, workspace symbols, and conservative native indentation
formatting. Some parsed constructs still produce capability errors rather than
semantic analysis; references/rename and general keyword/local completion are
not implemented. Community code actions and this extension's debugger integration
remain REDscript-only. See the [server's REDmod limitations](https://github.com/jac3km4/redscript-ide#redmod-and-document-lifecycle)
for the current supported subset. Highlighting works without the new server,
but does not imply that a construct is supported by analysis.

## configuration

All settings are optional; the language server can run without any configuration.
Set `redscript.scriptCachePath` to a compiled script cache file to use it instead
of locating the cache through `redscript.gameDir`. The debugger still requires
`redscript.gameDir` to discover running game instances.

The language server will attempt to load a TOML file named `.redscript` from every workspace folder.
This file can contain the following configuration options:

- `source_roots` allows you to specify source directories where the server should look for `.reds` and `.script` files, defaults to `["."]`
- `format` block allows you to configure the formatter, you can find the available options [here](https://github.com/jac3km4/redscript/blob/c3d0ec6f12583eccc51b5a482583e8fb6641ce8d/crates/dotfile/src/lib.rs#L36-L43)

Here's an example `.redscript` file:

```toml
source_roots = [".", "../red4ext/plugins"]

[format]
indent = 2
max_width = 80
```
