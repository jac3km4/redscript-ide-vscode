# redscript-ide-vscode
VS Code extension for redscript, client for [the redscript IDE](https://github.com/jac3km4/redscript-ide).

## usage

This extension can be installed by dragging [the latest VSIX release](https://github.com/jac3km4/redscript-ide-vscode/releases) file onto your VSCode extension bar.

To complete the setup, you need to provide the game installation path in preferences:

<img src="https://user-images.githubusercontent.com/11986158/189502554-4feb3761-5b28-4db7-a459-66754eed6227.png"  width="760" />

If you don't like the UI, it can also be added in JSON preferences:
```json
"redscript.gameDir": "D:\\path\\to\\base\\game\\Cyberpunk 2077",
```

## features
- error and warning diagnostics
- autocompletion for methods and fields
- hover for function definitions and types
- go-to-definition
  - bonus: limited support for redmod (scripted functions)

![ide-gif](https://user-images.githubusercontent.com/11986158/135734766-b5423e2c-cf47-4836-97ba-5c771cef7cf2.gif)
