/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { xhr, getErrorStatusDescription } from 'request-light';
import * as fs from 'fs';
import * as os from 'os';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import path = require('path');

const DAP_PORT = 8435;

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
  activateDebug(context);

  let exePath: string | undefined;
  try {
    exePath = await retrieveArtifact(context);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to download the language server: ${error}`);
    return;
  }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { command: exePath },
    debug: { command: exePath }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: 'file', language: 'redscript' }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: vscode.workspace.createFileSystemWatcher('**/.reds')
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'redscript-lsp',
    'Redscript Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();
}

export async function deactivate() {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

function activateDebug(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('extension.redscript.attach', config => {
    vscode.debug.startDebugging(undefined, {
      type: 'redscript',
      name: 'Attach to Cyberpunk 2077',
      request: 'attach'
    });
  }));

  const provider = new RedscriptDebugConfigurationProvider();
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('redscript', provider));
  const factory = new RedscriptDebugAdapterServerDescriptorFactory();
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('redscript', factory));
}

async function retrieveArtifact(context: vscode.ExtensionContext): Promise<string> {
  const channel = vscode.window.createOutputChannel("Redscript");

  const currentVersion: string | undefined = context.globalState.get("redscript-ide.version");
  const currentArtifact = currentVersion ? await getIdeExePath(context, currentVersion) : undefined;
  const latest = await getLatestRelease().catch(err => {
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
    await fs.promises.mkdir(path.dirname(desiredArtifact.path), { recursive: true });
    await fs.promises.writeFile(desiredArtifact.path, contents);
    await fs.promises.chmod(desiredArtifact.path, 0o755);

    context.globalState.update("redscript-ide.version", latest.tagName);
  }

  channel.appendLine(`Using an artifact at ${desiredArtifact.path}`);
  channel.dispose();

  return desiredArtifact.path;
}

async function downloadFile(url: string): Promise<Uint8Array> {
  return xhr({ url, followRedirects: 5 })
    .then(response => response.body)
    .catch(error => {
      throw new Error(error.responseText || getErrorStatusDescription(error.status) || error.toString());
    });
}

async function getIdeExePath(context: vscode.ExtensionContext, version: string): Promise<{ path: string, exists: boolean }> {
  const binaryPath = path.join(context.globalStorageUri.fsPath, "artifacts", `redscript-ide-${version}`, getExeName());
  const exists = await fs.promises.access(binaryPath).then(() => true, () => false);
  return { path: binaryPath, exists };
}

async function getLatestRelease(): Promise<{ tagName: string, url: string } | undefined> {
  const url = "https://api.github.com/repos/jac3km4/redscript-ide/releases/latest";
  const response = await xhr({ url, followRedirects: 5, headers: { "User-Agent": "redscript-ide" } })
    .catch(error => {
      throw new Error(error.responseText || getErrorStatusDescription(error.status) || error.toString());
    });

  if (response.status !== 200) {
    throw new Error(`Received an error code from Github: ${response.status}`);
  }
  const { tag_name, assets } = JSON.parse(response.responseText);
  const exeName = getExeName();
  const exeAsset = assets.find((asset: any) => asset.name === exeName);
  if (!exeAsset) {
    throw new Error(`No ${exeName} in the latest release`);
  }
  return { tagName: tag_name, url: exeAsset.browser_download_url };
}

function getExeName(): string {
  let platform: string;
  switch (os.platform()) {
    case 'win32':
      return 'redscript-ide.exe';
    case 'darwin':
      platform = `apple-darwin`;
      break;
    case 'linux':
      platform = `unknown-linux-gnu`;
      break;
    default:
      throw new Error(`Unsupported platform: ${os.platform()}`);
  }

  let arch: string;
  switch (os.arch()) {
    case 'x64':
      arch = 'x86_64';
      break;
    case 'arm64':
      arch = 'aarch64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${os.arch()}`);
  }

  return `redscript-ide-${arch}-${platform}`;
}


class RedscriptDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterServer(DAP_PORT);
  }
}

class RedscriptDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'redscript') {
        config.type = 'redscript';
        config.name = 'Attach to Cyberpunk 2077';
        config.request = 'attach';
      }
    }
    return config;
  }
}
