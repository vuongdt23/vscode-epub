import * as vscode from 'vscode';
import * as path from 'path';

const log = vscode.window.createOutputChannel('EPUB Reader');

export class EpubEditorProvider implements vscode.CustomReadonlyEditorProvider {
  private static readonly viewType = 'epubReader.viewer';

  constructor(private readonly context: vscode.ExtensionContext) {
    log.show(true); // Show output channel without stealing focus
    log.appendLine('[EpubEditorProvider] Initialized');
  }

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
    log.appendLine(`[resolveCustomEditor] Reading file: ${document.uri.toString()}`);
    const fileData = await vscode.workspace.fs.readFile(document.uri);
    log.appendLine(`[resolveCustomEditor] File read, size: ${fileData.byteLength} bytes`);

    const savedLocation = this.context.globalState.get<string>(
      `epub-location:${document.uri.toString()}`
    );
    log.appendLine(`[resolveCustomEditor] Saved location: ${savedLocation || '(none)'}`);

    webviewPanel.webview.onDidReceiveMessage(
      (message) => {
        log.appendLine(`[message from webview] ${message.type}`);
        if (message.type === 'ready') {
          log.appendLine(`[resolveCustomEditor] Webview ready, sending loadBook (${fileData.byteLength} bytes)`);
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
        log.appendLine(`[locationChanged] ${message.location?.slice(0, 60)}...`);
        this.context.globalState.update(
          `epub-location:${uri.toString()}`,
          message.location
        );
        break;
      case 'updateBookmarks':
        log.appendLine(`[updateBookmarks] ${message.bookmarks?.length} bookmarks`);
        this.context.globalState.update(
          `epub-bookmarks:${uri.toString()}`,
          message.bookmarks
        );
        break;
      default:
        log.appendLine(`[handleMessage] Unknown message type: ${message.type}`);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' blob: https://fonts.googleapis.com; script-src 'nonce-${nonce}' 'unsafe-inline' blob:; img-src ${webview.cspSource} blob: data: https:; font-src ${webview.cspSource} data: blob: https://fonts.gstatic.com; frame-src blob:; connect-src blob: https://fonts.googleapis.com https://fonts.gstatic.com;">
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
