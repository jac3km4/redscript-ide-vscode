# redscript-ide-vscode
VS Code extension for redscript, client for [the redscript IDE](https://github.com/jac3km4/redscript-ide).

## usage

*VS Code 1.78 introduced a regression that breaks this extension. Until a new version is released you should downgrade your VS Code: https://code.visualstudio.com/updates/v1_77*

This extension can be installed by dragging [the latest VSIX release](https://github.com/jac3km4/redscript-ide-vscode/releases) file onto your VSCode extension bar.

To complete the setup, you need to fill in at least one of the preferences:

<img src="https://user-images.githubusercontent.com/11986158/189502554-4feb3761-5b28-4db7-a459-66754eed6227.png"  width="760" />

If you don't like the UI, they can also be added as JSON preferences:
```json
"redscript.gameDir": "D:\\path\\to\\base\\game\\Cyberpunk 2077",
"redscript.scriptCachePath": "D:\\path\\to\\r6\\cache\\final.redscripts.bk"
```
You can provide either `gameDir` or `scriptCachePath` (you need at least one of them).

## features
- error and warning diagnostics
- autocompletion for methods and fields
- hover for function definitions and types

![ide-gif](https://user-images.githubusercontent.com/11986158/135734766-b5423e2c-cf47-4836-97ba-5c771cef7cf2.gif)
