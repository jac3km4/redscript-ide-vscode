import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import path from "path";
import fetch from "node-fetch";
import { Octokit } from "@octokit/rest";

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("redscript");
  const gameDir = config.get("gameDir") ? config.get("gameDir") : undefined;
  const scriptCachePath = config.get<string>("scriptCachePath")
    ? config.get<string>("scriptCachePath")
    : undefined;
  const usePrerelease = config.get<boolean>("prerelease") ? true : false;

  activateDebug(context);

  if (gameDir === undefined && scriptCachePath === undefined) {
    vscode.window.showErrorMessage(
      "You're missing basic configuration for the REDscript extension.",
    );
    return;
  }

  let exePath: string | undefined;
  try {
    exePath = await retrieveArtifact(context, usePrerelease);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to download the language server: ${error}.`,
    );
    return;
  }

  const serverOptions: ServerOptions = {
    run: { command: exePath },
    debug: { command: exePath },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "redscript" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/.reds"),
    },
    initializationOptions: {
      game_dir: gameDir,
      script_cache_path: scriptCachePath,
    },
  };

  client = new LanguageClient(
    "redscript-lsp",
    "Redscript Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export async function deactivate() {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

async function retrieveArtifact(
  context: vscode.ExtensionContext,
  usePrerelease: boolean,
): Promise<string> {
  const channel = vscode.window.createOutputChannel("Redscript");

  const currentVersion: string | undefined = context.globalState.get(
    "redscript-ide.version",
  );
  const currentArtifact = currentVersion
    ? await getIdeExePath(context, currentVersion)
    : undefined;
  const latest = await getLatestRelease(usePrerelease).catch((err) => {
    channel.appendLine(`Failed to get the latest release: ${err.message}`);
    return undefined;
  });

  if (latest === undefined && currentArtifact?.exists) {
    return currentArtifact.path;
  } else if (latest === undefined) {
    throw new Error("Could not download redscript-ide from Github");
  }

  const desiredArtifact = await getIdeExePath(context, latest.tagName);
  if (!desiredArtifact.exists) {
    channel.appendLine(`Artifact ${latest.tagName} not found, downloading...`);
    let contents = await downloadFile(latest.url);
    await fs.promises.mkdir(path.dirname(desiredArtifact.path), {
      recursive: true,
    });
    await fs.promises.writeFile(desiredArtifact.path, Buffer.from(contents));
    await fs.promises.chmod(desiredArtifact.path, 0o755);

    context.globalState.update("redscript-ide.version", latest.tagName);
  }

  channel.appendLine(`Using an artifact at ${desiredArtifact.path}`);
  channel.dispose();

  return desiredArtifact.path;
}

async function downloadFile(url: string): Promise<ArrayBuffer> {
  return fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    return response.arrayBuffer();
  });
}

async function getIdeExePath(
  context: vscode.ExtensionContext,
  version: string,
): Promise<{ path: string; exists: boolean }> {
  const binaryPath = path.join(
    context.globalStorageUri.fsPath,
    "artifacts",
    `redscript-ide-${version}`,
    getExeName(),
  );
  const exists = await fs.promises.access(binaryPath).then(
    () => true,
    () => false,
  );
  return { path: binaryPath, exists };
}

async function getLatestRelease(
  includePreReleases: boolean,
): Promise<{ tagName: string; url: string } | undefined> {
  const octokit = new Octokit();
  let release;

  if (includePreReleases) {
    const response = await octokit.repos.listReleases({
      owner: "jac3km4",
      repo: "redscript-ide",
      per_page: 1,
    });

    if (response.status !== 200) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    release = response.data[0];
    if (!release) {
      throw new Error(`No release found`);
    }
  } else {
    const response = await octokit.repos.getLatestRelease({
      owner: "jac3km4",
      repo: "redscript-ide",
      per_page: 1,
    });

    if (response.status !== 200) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    release = response.data;
    if (!release) {
      throw new Error(`No release found`);
    }
  }

  const exeName = getExeName();
  const exeAsset = release.assets.find((asset) => asset?.name === exeName);
  if (!exeAsset) {
    throw new Error(`No ${exeName} in the latest release`);
  }
  return { tagName: release.tag_name, url: exeAsset.browser_download_url };
}

function getExeName(): string {
  let platform: string;
  switch (os.platform()) {
    case "win32":
      return "redscript-ide.exe";
    case "darwin":
      platform = `apple-darwin`;
      break;
    case "linux":
      platform = `unknown-linux-gnu`;
      break;
    default:
      throw new Error(`Unsupported platform: ${os.platform()}`);
  }

  let arch: string;
  switch (os.arch()) {
    case "x64":
      arch = "x86_64";
      break;
    case "arm64":
      arch = "aarch64";
      break;
    default:
      throw new Error(`Unsupported architecture: ${os.arch()}`);
  }

  return `redscript-ide-${arch}-${platform}`;
}

function activateDebug(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.redscript.attach", () => {
      getDebugPorts().then((ports) => {
        if (ports.length === 0) {
          vscode.window
            .showInformationMessage(
              `No game instances found, make sure you have the latest redscript-dap installed.
You can also check '{gameDir}/red4ext/logs/redscript_dap-{timestamp}.log' for more information.
`,
              "Take me to the latest release",
            )
            .then((item) => {
              if (item) {
                vscode.env.openExternal(
                  vscode.Uri.parse(
                    "https://github.com/jac3km4/redscript-dap/releases/latest",
                  ),
                );
              }
            });

          return;
        }

        let qp = vscode.window.createQuickPick();
        qp.title = "Available game instances";
        qp.items = ports.map(([port, time]) => ({
          label: `Cyberpunk 2077 - ${time.toLocaleString()}`,
          description: port.toString(),
        }));
        qp.onDidAccept(() => {
          const port = qp.selectedItems[0]?.description;
          if (port !== undefined) {
            vscode.debug.startDebugging(undefined, {
              type: "redscript",
              request: "attach",
              name: "Attach to Cyberpunk 2077",
              port: parseInt(port),
            });
            qp.hide();
          }
        });
        qp.show();
      });
    }),
  );

  const provider = new RedscriptDebugConfigurationProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("redscript", provider),
  );
  const factory = new RedscriptDebugAdapterServerDescriptorFactory();
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("redscript", factory),
  );
}

async function getDebugPorts(): Promise<[number, Date][]> {
  const gameDir = vscode.workspace
    .getConfiguration("redscript")
    .get<string>("gameDir");
  if (!gameDir) {
    return [];
  }

  const binPath = path.join(gameDir, "bin", "x64");
  const binDir = await fs.promises.opendir(binPath);

  let found: [number, Date][] = [];
  for await (const ent of binDir) {
    const [, port] = ent.name.match("dap\.([0-9]+)\.debug") || [];
    if (port) {
      const fullPath = path.join(binPath, ent.name);
      const time = await fs.promises.stat(fullPath).then(
        (stat) => stat.mtimeMs,
        () => 0,
      );
      found.push([parseInt(port), new Date(time)]);
    }
  }

  return found;
}

class RedscriptDebugAdapterServerDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined,
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterServer(session.configuration["port"]);
  }
}

class RedscriptDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    if (!config.type && !config.request && !config.name && !config["port"]) {
      const editor = vscode.window.activeTextEditor;

      getDebugPorts().then(([port]) => {
        if (
          editor &&
          editor.document.languageId === "redscript" &&
          port !== undefined
        ) {
          config.type = "redscript";
          config.request = "attach";
          config.name = "Attach to Cyberpunk 2077";
          config["port"] = port;
        }
      });
    }
    return config;
  }
}
