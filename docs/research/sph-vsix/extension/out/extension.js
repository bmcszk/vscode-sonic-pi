"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const completions_1 = require("./completions");
const hover_1 = require("./hover");
const sonicPiConnection_1 = require("./sonicPiConnection");
const LANGUAGES = ["sonic-pi", "ruby"];
function activate(context) {
    const extPath = context.extensionPath;
    // IntelliSense — completions
    const completionProvider = new completions_1.SonicPiCompletionProvider(extPath);
    for (const lang of LANGUAGES) {
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: lang }, completionProvider, ":", ","));
    }
    // Hover — documentación inline
    const hoverProvider = new hover_1.SonicPiHoverProvider(extPath);
    for (const lang of LANGUAGES) {
        context.subscriptions.push(vscode.languages.registerHoverProvider({ language: lang }, hoverProvider));
    }
    // Comando: ejecutar código en Sonic Pi
    context.subscriptions.push(vscode.commands.registerCommand("sonicPi.run", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Abre un archivo de Sonic Pi primero.");
            return;
        }
        const code = editor.selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(editor.selection);
        if (!(0, sonicPiConnection_1.isSonicPiRunning)()) {
            vscode.window.showErrorMessage("Sonic Pi no está en ejecución. Ábrelo primero.");
            return;
        }
        const result = await (0, sonicPiConnection_1.runCode)(code);
        if (result.ok) {
            vscode.window.setStatusBarMessage("$(play) Sonic Pi: enviado", 3000);
        }
        else {
            vscode.window.showErrorMessage(`Error enviando a Sonic Pi: ${result.error}`);
        }
    }));
    // Comando: detener todo
    context.subscriptions.push(vscode.commands.registerCommand("sonicPi.stop", async () => {
        const result = await (0, sonicPiConnection_1.stopAll)();
        if (result.ok) {
            vscode.window.setStatusBarMessage("$(debug-stop) Sonic Pi: detenido", 3000);
        }
        else {
            vscode.window.showErrorMessage(`Error: ${result.error}`);
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map