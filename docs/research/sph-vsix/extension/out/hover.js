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
exports.SonicPiHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const data_1 = require("./data");
class SonicPiHoverProvider {
    constructor(extensionPath) {
        this.extensionPath = extensionPath;
    }
    provideHover(document, position) {
        const data = (0, data_1.getData)(this.extensionPath);
        const range = document.getWordRangeAtPosition(position, /:[a-z][a-z0-9_]*/);
        if (!range)
            return null;
        const word = document.getText(range).slice(1); // quitar el ':'
        const synth = data.synths.find((s) => s.key === word);
        if (synth)
            return this.synthHover(synth);
        const fx = data.fx.find((f) => f.key === word);
        if (fx)
            return this.fxHover(fx);
        if ((0, data_1.allSampleKeys)(data).includes(word))
            return this.sampleHover(word, data);
        return null;
    }
    synthHover(s) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### Synth \`:${s.key}\`\n\n`);
        md.appendMarkdown(`${s.doc}\n\n`);
        md.appendMarkdown(`**Uso:** \`use_synth :${s.key}\`\n\n`);
        md.appendMarkdown(`**Parámetros:** \`${s.params.join("`, `")}\``);
        return new vscode.Hover(md);
    }
    fxHover(f) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### FX \`:${f.key}\`\n\n`);
        md.appendMarkdown(`${f.doc}\n\n`);
        md.appendMarkdown("**Uso:**\n");
        md.appendCodeblock(`with_fx :${f.key} do\n  # tu código\nend`, "ruby");
        md.appendMarkdown(`\n**Parámetros:** \`${f.params.join("`, `")}\``);
        return new vscode.Hover(md);
    }
    sampleHover(name, data) {
        const category = Object.entries(data.samples).find(([, names]) => names.includes(name))?.[0] ?? "Sample";
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### Sample \`:${name}\`\n\n`);
        md.appendMarkdown(`Categoría: **${category}**\n\n`);
        md.appendMarkdown("**Uso:**\n");
        md.appendCodeblock(`sample :${name}, amp: 1, rate: 1`, "ruby");
        return new vscode.Hover(md);
    }
}
exports.SonicPiHoverProvider = SonicPiHoverProvider;
//# sourceMappingURL=hover.js.map