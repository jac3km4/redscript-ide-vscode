# redscript-ide-vscode

VS Code extension for redscript, client for [redscript IDE](https://github.com/jac3km4/redscript-ide).

# usage

This extension can be installed by dragging the VSIX release file onto your VSCode extension bar.
To complete the setup, you need to add some fields in your VSCode user preferences:
```json
"redscript.gameDir": "D:\\path\\to\\base\\game\\Cyberpunk 2077",
"redscript.scriptCachePath": "D:\\path\\to\\r6\\cache\\final.redscripts.bk"
```
You can provide either `gameDir` or `scriptCachePath` (you need at least one of them).
