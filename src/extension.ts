/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, ExtensionContext, window } from 'vscode';
import { xhr, getErrorStatusDescription } from 'request-light';
import * as fs from 'fs';
import * as https from 'https';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import path = require('path');

let client: LanguageClient;

const version = "v0.1.1";
const exeDownloadUrl = `https://github.com/jac3km4/redscript-ide/releases/download/${version}/redscript-ide.exe`;

export async function activate(context: ExtensionContext) {
  const exePath = await retrieveArtifact(context, exeDownloadUrl, version);

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
      fileEvents: workspace.createFileSystemWatcher('**/.reds')
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

async function retrieveArtifact(context: ExtensionContext, url: string, version: string): Promise<string> {
  const channel = window.createOutputChannel("Redscript");

  const artifact = path.basename(url);
  const artifactPath = getArtifactPath(context, artifact, version);
  const exists = await fs.promises.access(artifactPath).then(() => true, () => false);

  if (!exists) {
    channel.appendLine(`Artifact '${artifact}' not found, downloading...`);
    let contents = await downloadFile(url);
    await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.promises.writeFile(artifactPath, contents);
  }

  channel.appendLine(`Using an artifact at ${artifactPath}`);
  channel.dispose();

  return artifactPath;
}

async function downloadFile(url: string): Promise<Uint8Array> {
  return xhr({ url, followRedirects: 5 })
    .then(response => response.body)
    .catch(error => {
      throw new Error(error.responseText || getErrorStatusDescription(error.status) || error.toString());
    });
}

function getArtifactPath(context: ExtensionContext, artifact: string, version: string): string {
  const parsed = path.parse(artifact);
  return path.join(context.globalStorageUri.fsPath, "artifacts", `${parsed.name}-${version}`, artifact);
}
