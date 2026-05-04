import * as vscode from 'vscode';
import * as path from 'path';

export class EpubEditorProvider implements vscode.CustomReadonlyEditorProvider {
  private static readonly viewType = 'epubReader.viewer';

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist'),
      ],
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    // Read the EPUB file and send to webview
    const fileData = await vscode.workspace.fs.readFile(document.uri);
    const savedLocation = this.context.globalState.get<string>(
      `epub-location:${document.uri.toString()}`
    );

    webviewPanel.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'ready') {
          // Webview JS has loaded — now send the book data
          webviewPanel.webview.postMessage({
            type: 'loadBook',
            data: Array.from(fileData),
            location: savedLocation || undefined,
          });
          return;
        }
        this.handleMessage(message, document.uri);
      },
      undefined,
      []
    );
  }

  private handleMessage(message: any, uri: vscode.Uri) {
    switch (message.type) {
      case 'locationChanged':
        this.context.globalState.update(
          `epub-location:${uri.toString()}`,
          message.location
        );
        break;
      case 'updateBookmarks':
        this.context.globalState.update(
          `epub-bookmarks:${uri.toString()}`,
          message.bookmarks
        );
        break;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'webview',
      'dist'
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'assets', 'index.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-inline' blob:; img-src ${webview.cspSource} blob: data: https:; font-src ${webview.cspSource} data: blob:; frame-src blob:; connect-src blob:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>EPUB Reader</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
