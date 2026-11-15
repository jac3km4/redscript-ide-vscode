import * as vscode from "vscode";
import type { Dir } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("redscript");
  const gameDir = config.get<string>("gameDir") || undefined;
  const scriptCachePath = config.get<string>("scriptCachePath") || undefined;
  const ideVersion = config.get<string>("ideVersion");
  let idePath = config.get<string>("idePath");

  const outputChannel = vscode.window.createOutputChannel("Redscript", {
    log: true,
  });
  context.subscriptions.push(outputChannel);

  activateDebug(context);

  if (!idePath) {
    try {
      idePath = await retrieveArtifact(context, outputChannel, ideVersion);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to download the language server: ${error}.`,
      );
      return;
    }
  }

  const serverOptions: ServerOptions = {
    run: { command: idePath },
    debug: { command: idePath },
  };

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{reds,script}");
  context.subscriptions.push(watcher);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "redscript" },
      { scheme: "file", language: "redmod" },
    ],
    synchronize: {
      fileEvents: watcher,
    },
    outputChannel,
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

  context.subscriptions.push(client);
  await client.start();
}

export async function deactivate() {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

async function retrieveArtifact(
  context: vscode.ExtensionContext,
  channel: vscode.LogOutputChannel,
  ideVersion?: string,
): Promise<string> {
  const currentVersion: string | undefined = context.globalState.get(
    "redscript-ide.version",
  );
  const currentArtifact = currentVersion
    ? await getIdeExePath(context, currentVersion)
    : undefined;
  const release = await getRelease(ideVersion).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(
      `Failed to get the latest REDscript release: ${message}`,
    );
    return undefined;
  });

  if (release === undefined && currentArtifact?.exists) {
    return currentArtifact.path;
  } else if (release === undefined) {
    throw new Error("Could not download redscript-ide from Github");
  }

  const desiredArtifact = await getIdeExePath(context, release.tagName);
  if (!desiredArtifact.exists) {
    channel.info(`Artifact ${release.tagName} not found, downloading...`);
    const contents = await downloadFile(release.url);
    await fs.mkdir(path.dirname(desiredArtifact.path), {
      recursive: true,
    });
    await fs.writeFile(desiredArtifact.path, Buffer.from(contents));
    await fs.chmod(desiredArtifact.path, 0o755);

    await context.globalState.update("redscript-ide.version", release.tagName);
  }

  channel.info(`Using an artifact at ${desiredArtifact.path}`);

  return desiredArtifact.path;
}

async function downloadFile(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  return response.arrayBuffer();
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
  const exists = await fs.access(binaryPath).then(
    () => true,
    () => false,
  );
  return { path: binaryPath, exists };
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name?: string;
    browser_download_url: string;
  }>;
}

async function getRelease(
  wantedVersion?: string,
): Promise<{ tagName: string; url: string } | undefined> {
  const baseUrl = "https://api.github.com/repos/jac3km4/redscript-ide/releases";
  const url = wantedVersion
    ? `${baseUrl}/tags/v${encodeURIComponent(wantedVersion)}`
    : `${baseUrl}/latest`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "redscript-ide-vscode",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const release = (await response.json()) as GitHubRelease | undefined;
  if (!release) {
    throw new Error(`No release found`);
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
    vscode.commands.registerCommand("extension.redscript.attach", async () => {
      const ports = await getDebugPorts();
      if (ports.length === 0) {
        const item = await vscode.window.showInformationMessage(
          `No game instances found, make sure you have the latest redscript-dap installed.
You can also check '{gameDir}/red4ext/logs/redscript_dap-{timestamp}.log' for more information.
`,
          "Take me to the latest release",
        );
        if (item) {
          await vscode.env.openExternal(
            vscode.Uri.parse(
              "https://github.com/jac3km4/redscript-dap/releases/latest",
            ),
          );
        }
        return;
      }

      const selected = await vscode.window.showQuickPick(
        ports.map(([port, time]) => ({
          label: `Cyberpunk 2077 - ${time.toLocaleString()}`,
          description: port.toString(),
          port,
        })),
        { title: "Available game instances" },
      );

      if (selected !== undefined) {
        await vscode.debug.startDebugging(undefined, {
          type: "redscript",
          request: "attach",
          name: "Attach to Cyberpunk 2077",
          port: selected.port,
        });
      }
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
  let binDir: Dir;
  try {
    binDir = await fs.opendir(binPath);
  } catch {
    return [];
  }

  const found: [number, Date][] = [];
  for await (const ent of binDir) {
    const [, port] = ent.name.match(/dap\.([0-9]+)\.debug/) || [];
    if (port) {
      const fullPath = path.join(binPath, ent.name);
      const time = await fs.stat(fullPath).then(
        (stat) => stat.mtimeMs,
        () => 0,
      );
      found.push([parseInt(port, 10), new Date(time)]);
    }
  }

  return found;
}

class RedscriptDebugAdapterServerDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined,
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterServer(session.configuration["port"]);
  }
}

class RedscriptDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider {
  async resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken,
  ): Promise<vscode.DebugConfiguration> {
    if (!config.type && !config.request && !config.name && !config["port"]) {
      const editor = vscode.window.activeTextEditor;
      const [first] = await getDebugPorts();

      if (
        editor &&
        editor.document.languageId === "redscript" &&
        first !== undefined
      ) {
        config.type = "redscript";
        config.request = "attach";
        config.name = "Attach to Cyberpunk 2077";
        config["port"] = first[0];
      }
    }
    return config;
  }
}
