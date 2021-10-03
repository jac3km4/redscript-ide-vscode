/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, ExtensionContext, Uri } from 'vscode';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient;

const exeUri = Uri.parse("https://github.com/jac3km4/redscript-ide/releases/download/v0.0.1/redscript-ide.exe");

export async function activate(context: ExtensionContext) {
  const fileDownloader: FileDownloader = await getApi();
  let serverExe = await fileDownloader.tryGetItem("redscript-ide.exe", context);
  if (!serverExe) {
    serverExe = await fileDownloader.downloadFile(exeUri, "redscript-ide.exe", context);
  }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { command: serverExe.fsPath },
    debug: { command: serverExe.fsPath }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: 'file', language: 'swift' }],
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
