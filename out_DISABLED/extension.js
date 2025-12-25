"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = require("vscode");
const WebSocket = require("ws");
function activate(context) {
    console.log('Congratulations, your extension "proposed-api-sample" is now active!');
    /**
     * You can use proposed API here. `vscode.` should start auto complete
     * Proposed API as defined in vscode.proposed.<proposalName>.d.ts.
     */
    const disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World!');
    });
    context.subscriptions.push(disposable);
    const echoCommand = vscode.commands.registerCommand('extension.echoInput', async () => {
        const userInput = await vscode.window.showInputBox({ prompt: 'Enter some text' });
        if (userInput) {
            vscode.window.showInformationMessage(`You entered: ${userInput}`);
        }
        else {
            vscode.window.showInformationMessage('No input provided.');
        }
    });
    context.subscriptions.push(echoCommand);
    const ws = new WebSocket('ws://localhost:3001'); // Connect to the NestJS backend
    ws.on('open', () => {
        console.log('WebSocket connection established with backend.');
    });
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
    const logCommand = vscode.commands.registerCommand('extension.logMessage', () => {
        const logMessage = `Log at ${new Date().toISOString()}`;
        vscode.window.showInformationMessage(logMessage);
        ws.send(JSON.stringify({ type: 'log', message: logMessage })); // Send log to backend
    });
    context.subscriptions.push(logCommand);
}
//# sourceMappingURL=extension.js.map