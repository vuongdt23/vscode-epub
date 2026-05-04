import * as vscode from 'vscode';
import { EpubEditorProvider } from './epubEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new EpubEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'epubReader.viewer',
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('epubReader.openFile', async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'EPUB Files': ['epub'] },
      });
      if (fileUri && fileUri[0]) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri[0],
          'epubReader.viewer'
        );
      }
    })
  );
}

export function deactivate() {}
