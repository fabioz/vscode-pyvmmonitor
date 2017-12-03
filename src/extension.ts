'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
let ini = require('ini'); // non typescript

export function activate(context: vscode.ExtensionContext) {

    let iniLocation: string;

    function getPyVmMonitorLocation(): string {
        if (process.platform == "win32") {
            let localAppData = process.env["LOCALAPPDATA"];
            if (localAppData) {
                iniLocation = path.join(localAppData, "Brainwy", "PyVmMonitor.ini");
            } else {
                iniLocation = "Unable to get LOCALAPPDATA variable.";
            }

        } else if (process.platform == "darwin") {
            let homedir = os.homedir();
            iniLocation = path.join(homedir, "Library", "Application Support", "Brainwy", "PyVmMonitor.ini");

        } else {
            // Linux
            let homedir = os.homedir();
            iniLocation = path.join(homedir, ".config", "Brainwy", "pyvmmonitor.ini");
        }

        if (fs.existsSync(iniLocation)) {
            var config = ini.parse(fs.readFileSync(iniLocation, 'utf-8'));
            if (!config || !config.General) {
                return '';
            }
            let location = config.General.pyvmmonitor_ui_executable;
            if (fs.existsSync(location)) {
                return location;
            }
            let msg = "PyVmMonitor location (" + location + ") found in ini: " + iniLocation + " is not valid.";
            console.log(msg);
            vscode.window.showWarningMessage(msg);
        } else {
            let msg = "It seems PyVmMonitor is not installed or was never run. Expected to find ini at: " + iniLocation;
            console.log(msg);
            vscode.window.showWarningMessage(msg);
        }
        return ''
    }

    /**
     * Note: this is not ideal: we're reimplementing an execution in the terminal. Ideally we'd be able to 
     * hook into launches and add the required parameters to add the profiling (as in PyDev).
     * 
     * See: execInTerminal in the python plugin.
     */
    function execInTerminal(filePath: string, args: string) {
        const terminalShellSettings = vscode.workspace.getConfiguration('terminal.integrated.shell');
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        const IS_POWERSHELL = /powershell/.test(terminalShellSettings.get<string>('windows'));

        if (filePath.indexOf(' ') > 0) {
            filePath = `"${filePath}"`;
        }

        // Note: for now always opening a new terminal.
        let terminal: vscode.Terminal;
        terminal = terminal ? terminal : vscode.window.createTerminal('Python');

        // Always executing on the file directory
        const fileDirPath = path.dirname(filePath);
        const wkspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (wkspace && fileDirPath !== wkspace.uri.fsPath && fileDirPath.substring(1) !== wkspace.uri.fsPath) {
            terminal.sendText(`cd "${fileDirPath}"`);
        }
        let pyvmmonitorLocation: string = getPyVmMonitorLocation();
        if (!pyvmmonitorLocation) {
            return;
        }
        // Ok, found the pyvmmonitor location. Let's compute the relative path for the public api 
        // which will be the main module to be launched.
        let publicLaunchLocation: string = path.join(path.dirname(pyvmmonitorLocation), 'public_api', 'pyvmmonitor', '__init__.py');
        publicLaunchLocation = path.resolve(publicLaunchLocation);
        if (publicLaunchLocation.indexOf(' ') > 0) {
            publicLaunchLocation = `"${publicLaunchLocation}"`;
        }

        const command = `python ${publicLaunchLocation}${args} ${filePath}`;
        if (process.platform == "win32") { // There should be a better api?
            const commandWin = command.replace(/\\/g, '/');
            if (IS_POWERSHELL) {
                terminal.sendText(`& ${commandWin}`);
            } else {
                terminal.sendText(commandWin);
            }
        } else {
            terminal.sendText(command);
        }
        terminal.show();
    }

    function startPyVmMonitor(chosen: string) {
        if (chosen) { // may be undefined if user cancelled.
            let editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Unable to start profiling: no editor open.')
                return;
            }
            if (editor.document.isUntitled) {
                vscode.window.showWarningMessage('Unable to start profiling: please save editor before profiling.')
                return;
            }
            let filePath: string;
            filePath = editor.document.fileName;
            let languageId = editor.document.languageId;
            switch (chosen) {
                case PROFILE_YAPPI:
                    execInTerminal(filePath, ' --profile=yappi');
                    break;

                case PROFILE_CPROFILE:
                    execInTerminal(filePath, ' --profile=lsprof');
                    break;

                case PROFILE_CONNECTED:
                    execInTerminal(filePath, '');
                    break;
            }
        }
    };

    const PROFILE_YAPPI = "Start profiling with yappi";
    const PROFILE_CPROFILE = "Start profiling with profile/cProfile";
    const PROFILE_CONNECTED = "Start only with live sampling view";

    let disposable = vscode.commands.registerCommand('vscode-pyvmmonitor.profile', (fileUri?: vscode.Uri) => {
        vscode.window.showQuickPick([PROFILE_YAPPI, PROFILE_CPROFILE, PROFILE_CONNECTED]).then(
            val => startPyVmMonitor(val)
        );
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}