import * as path from 'path';
import { window, workspace, ExtensionContext } from 'vscode';
import * as net from 'net';
import * as child_process from 'child_process';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	StreamInfo,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;
let serverProcess: child_process.ChildProcessWithoutNullStreams;

export function activate(context: ExtensionContext) {
  const mechPath = context.asAbsolutePath(path.join('server', 'target', 'debug', 'mech'));
  serverProcess = child_process.spawn(mechPath, ['serve']);

  // Enable logging
  const log = window.createOutputChannel('Mech Language Server');
  log.show(true);
  serverProcess.stdout.on('data', (data) => log.appendLine(`[mech] ${data.toString().trim()}`));
  serverProcess.stderr.on('data', (data) => log.appendLine(`[mech error] ${data.toString().trim()}`));
  serverProcess.on('exit', (code) => log.appendLine(`[mech exited] code ${code}`));

  const serverOptions: ServerOptions = () =>
    new Promise<StreamInfo>((resolve, reject) => {
      let retryCount = 0;
  
      const tryConnect = () => {
        const connection = new net.Socket();
  
        connection.connect(8081, '127.0.0.1', () => {
          log.appendLine('✅ Client connected to mech-serve');
          resolve({ reader: connection, writer: connection });
        });
  
        connection.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ECONNREFUSED' && retryCount < 5) {
            retryCount += 1;
            log.appendLine(`🔁 Retry ${retryCount}: waiting for server...`);
            setTimeout(tryConnect, 1000);
          } else {
            reject(err);
          }
        });
  
        connection.on('close', () => connection.removeAllListeners());
      };
  
      tryConnect();
    });    

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'Mech' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc'),
    },
  };

  client = new LanguageClient('mechLanguageServer', 'Mech Language Server', serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (serverProcess && !serverProcess.killed) {
	serverProcess.kill();
  }
	
  if (!client) {
	return undefined;
  }

  client.stop();
}