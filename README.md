# redscript-ide-vscode

VS Code extension for REDscript, client for [the REDscript IDE](https://github.com/jac3km4/redscript-ide).

## installation

This extension can be installed from the [VSCode marketplace](https://marketplace.visualstudio.com/items?itemName=jac3km4.redscript-ide-vscode).

<img src="https://github.com/jac3km4/redscript/assets/11986158/04dc3c66-fd1b-4198-b365-8875e850c602"  width="240" />

To complete the setup, you need to provide the game installation path in preferences:

<img src="https://user-images.githubusercontent.com/11986158/189502554-4feb3761-5b28-4db7-a459-66754eed6227.png" width="560" />

## features

- error and warning diagnostics
- autocompletion for methods and fields
- hover for function definitions and types
- go-to-definition
  - bonus: limited support for redmod (scripted functions)
- workspace symbols
- formatting (beta)
- debugger (requires [redscript-dap](https://github.com/jac3km4/redscript-dap))
- hooks for external tools

![ide-gif](https://user-images.githubusercontent.com/11986158/135734766-b5423e2c-cf47-4836-97ba-5c771cef7cf2.gif)

## configuration

The language server will attempt to load a TOML file named `.redscript` from every workspace folder.
This file can contain the following configuration options:

- `source_roots` allows you to specify source directories where the compiler should look for REDscript files, defaults to `["."]`
- `format` block allows you to configure the formatter, you can find the available options [here](https://github.com/jac3km4/redscript/blob/c3d0ec6f12583eccc51b5a482583e8fb6641ce8d/crates/dotfile/src/lib.rs#L36-L43)

Here's an example `.redscript` file:

```toml
source_roots = [".", "../red4ext/plugins"]

[format]
indent = 2
max_width = 80
```
