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
exports.SonicPiCompletionProvider = void 0;
const vscode = __importStar(require("vscode"));
const data_1 = require("./data");
// Palabras clave del lenguaje Sonic Pi (funciones built-in)
const KEYWORDS = [
    ["play", "play note_or_chord, param: value"],
    ["play_chord", "play_chord [notes], param: value"],
    ["play_pattern_timed", "play_pattern_timed [notes], [times]"],
    ["sample", "sample :name, param: value"],
    ["sleep", "sleep beats"],
    ["use_synth", "use_synth :synth_key"],
    ["with_synth", "with_synth :synth_key do ... end"],
    ["with_fx", "with_fx :fx_key, opt: val do ... end"],
    ["live_loop", "live_loop :name do ... end"],
    ["in_thread", "in_thread do ... end"],
    ["use_bpm", "use_bpm 120"],
    ["with_bpm", "with_bpm 120 do ... end"],
    ["cue", "cue :event_name"],
    ["sync", "sync :event_name"],
    ["use_random_seed", "use_random_seed 42"],
    ["with_random_seed", "with_random_seed 42 do ... end"],
    ["ring", "(ring val1, val2, ...)"],
    ["tick", "ring.tick — avanza el índice cíclico"],
    ["choose", "array.choose — elemento aleatorio"],
    ["rrand", "rrand min, max — float aleatorio en rango"],
    ["rrand_i", "rrand_i min, max — entero aleatorio en rango"],
    ["rand", "rand max"],
    ["one_in", "one_in n — true con probabilidad 1/n"],
    ["spread", "spread pulses, steps — ritmo euclidiano"],
    ["note", "note :C4 — convierte símbolo a MIDI"],
    ["midi_notes", "midi_notes — lista de notas MIDI"],
    ["chord", "chord :C4, :major — genera un acorde"],
    ["scale", "scale :C4, :major — genera una escala"],
    ["control", "control synth_node, param: value"],
    ["stop", "stop — detiene el live_loop actual"],
    ["at", "at [tiempos] do |t| ... end"],
];
class SonicPiCompletionProvider {
    constructor(extensionPath) {
        this.extensionPath = extensionPath;
    }
    provideCompletionItems(document, position) {
        const data = (0, data_1.getData)(this.extensionPath);
        const linePrefix = document.lineAt(position).text.slice(0, position.character);
        const items = [];
        // Completions después de "use_synth :" o "with_synth :"
        if (/use_synth\s+:?\w*$/.test(linePrefix) || /with_synth\s+:?\w*$/.test(linePrefix)) {
            return this.synthCompletions(data);
        }
        // Completions después de "with_fx :"
        if (/with_fx\s+:?\w*$/.test(linePrefix)) {
            return this.fxCompletions(data);
        }
        // Completions después de "sample :"
        if (/sample\s+:?\w*$/.test(linePrefix)) {
            return this.sampleCompletions(data);
        }
        // Completions de parámetros: tras una coma dentro de play/sample/with_fx
        const paramContext = this.detectParamContext(linePrefix);
        if (paramContext) {
            return this.paramCompletions(data, paramContext);
        }
        // Completions de keywords Sonic Pi al inicio de línea o tras espacios
        for (const [kw, doc] of KEYWORDS) {
            const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Function);
            item.detail = doc;
            item.sortText = "0_" + kw;
            items.push(item);
        }
        return items;
    }
    synthCompletions(data) {
        return data.synths.map((s) => {
            const item = new vscode.CompletionItem(":" + s.key, vscode.CompletionItemKind.EnumMember);
            item.detail = s.doc.slice(0, 80);
            item.documentation = new vscode.MarkdownString(`**Synth** \`use_synth :${s.key}\`\n\n${s.doc}\n\n**Parámetros:** ${s.params.join(", ")}`);
            item.insertText = s.key; // ya hay : en el texto
            return item;
        });
    }
    fxCompletions(data) {
        return data.fx.map((f) => {
            const item = new vscode.CompletionItem(":" + f.key, vscode.CompletionItemKind.EnumMember);
            item.detail = f.doc.slice(0, 80);
            item.documentation = new vscode.MarkdownString(`**FX** \`with_fx :${f.key}\`\n\n${f.doc}\n\n**Parámetros:** ${f.params.join(", ")}`);
            item.insertText = f.key;
            return item;
        });
    }
    sampleCompletions(data) {
        return (0, data_1.allSampleKeys)(data).map((name) => {
            const item = new vscode.CompletionItem(":" + name, vscode.CompletionItemKind.Value);
            item.detail = "Sample";
            item.insertText = name;
            return item;
        });
    }
    detectParamContext(linePrefix) {
        if (/\bplay\b|\buse_synth\b|\bwith_synth\b/.test(linePrefix) && /,/.test(linePrefix))
            return "synth";
        if (/\bwith_fx\b/.test(linePrefix) && /,/.test(linePrefix))
            return "fx";
        if (/\bsample\b/.test(linePrefix) && /,/.test(linePrefix))
            return "sample";
        return null;
    }
    paramCompletions(data, context) {
        const synthParams = ["note", "amp", "pan", "attack", "decay", "sustain", "release",
            "attack_level", "sustain_level", "env_curve", "cutoff", "res"];
        const fxParams = ["mix", "amp", "pre_amp", "room", "damp", "phase", "decay",
            "distort", "cutoff", "bits", "sample_rate"];
        const sampleParams = ["amp", "rate", "pan", "attack", "release", "start", "finish",
            "beat_stretch", "pitch", "norm", "cutoff", "res"];
        const params = context === "fx" ? fxParams : context === "sample" ? sampleParams : synthParams;
        return params.map((p) => {
            const item = new vscode.CompletionItem(p + ":", vscode.CompletionItemKind.Property);
            item.insertText = new vscode.SnippetString(`${p}: \${1}`);
            return item;
        });
    }
}
exports.SonicPiCompletionProvider = SonicPiCompletionProvider;
//# sourceMappingURL=completions.js.map