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
exports.findSpiderInfo = findSpiderInfo;
exports.runCode = runCode;
exports.stopAll = stopAll;
exports.isSonicPiRunning = isSonicPiRunning;
const dgram = __importStar(require("dgram"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
// ---------------------------------------------------------------------------
// Descubrimiento de puertos según plataforma
// ---------------------------------------------------------------------------
function parseSpiderArgs(cmdLine) {
    // Forma: ruby ... spider-server.rb -u <port> <g> <s> <ss> <oc> <t> <tl> <token>
    const m = cmdLine.match(/spider-server\.rb\s+-u\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(-?\d+)/);
    if (!m)
        return null;
    return { port: parseInt(m[1], 10), token: parseInt(m[2], 10) };
}
function findSpiderInfoWindows() {
    const tmpScript = path.join(os.tmpdir(), "sp-find.ps1");
    const ps1 = `(Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -like '*spider-server*'}).CommandLine`;
    try {
        fs.writeFileSync(tmpScript, ps1, "utf-8");
        const out = (0, child_process_1.execSync)(`powershell -NoProfile -NonInteractive -File "${tmpScript}"`, { encoding: "utf-8", timeout: 5000 });
        return parseSpiderArgs(out);
    }
    catch {
        return null;
    }
    finally {
        try {
            fs.unlinkSync(tmpScript);
        }
        catch { /* ignorar */ }
    }
}
function findSpiderInfoLinux() {
    // En Linux leemos /proc/<pid>/cmdline directamente — sin truncamiento, sin grep
    try {
        const pids = fs.readdirSync("/proc").filter(d => /^\d+$/.test(d));
        for (const pid of pids) {
            try {
                const raw = fs.readFileSync(`/proc/${pid}/cmdline`, "utf-8");
                const cmdLine = raw.replace(/\0/g, " ");
                if (!cmdLine.includes("spider-server"))
                    continue;
                const info = parseSpiderArgs(cmdLine);
                if (info)
                    return info;
            }
            catch { /* proceso ya no existe, skip */ }
        }
        return null;
    }
    catch {
        return null;
    }
}
function findSpiderInfoMac() {
    // ps -ww evita que macOS trunque líneas largas
    try {
        const out = (0, child_process_1.execSync)("ps -ww aux | grep spider-server | grep -v grep", {
            encoding: "utf-8",
            timeout: 3000,
        });
        return parseSpiderArgs(out);
    }
    catch {
        return null;
    }
}
function findSpiderInfo() {
    switch (process.platform) {
        case "win32": return findSpiderInfoWindows();
        case "linux": return findSpiderInfoLinux();
        case "darwin": return findSpiderInfoMac();
        default: return findSpiderInfoMac(); // fallback Unix
    }
}
// ---------------------------------------------------------------------------
// Codificación OSC (Open Sound Control) sobre UDP
// ---------------------------------------------------------------------------
function padTo4(n) {
    return Math.ceil(n / 4) * 4;
}
function encodeOscString(s) {
    const raw = Buffer.from(s + "\0", "utf-8");
    const buf = Buffer.alloc(padTo4(raw.length));
    raw.copy(buf);
    return buf;
}
function encodeOscInt(n) {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(n, 0);
    return buf;
}
function buildRunCodeMessage(token, code) {
    return Buffer.concat([
        encodeOscString("/run-code"),
        encodeOscString(",is"),
        encodeOscInt(token),
        encodeOscString(code),
    ]);
}
function buildStopMessage(token) {
    return Buffer.concat([
        encodeOscString("/stop-all-jobs"),
        encodeOscString(",i"),
        encodeOscInt(token),
    ]);
}
// ---------------------------------------------------------------------------
// Envío UDP
// ---------------------------------------------------------------------------
function sendUdp(port, message) {
    return new Promise((resolve, reject) => {
        const client = dgram.createSocket("udp4");
        client.send(message, port, "127.0.0.1", (err) => {
            client.close();
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
async function runCode(code) {
    const info = findSpiderInfo();
    if (!info) {
        return { ok: false, error: "Sonic Pi no está en ejecución (no se encontró spider-server)." };
    }
    try {
        await sendUdp(info.port, buildRunCodeMessage(info.token, code));
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: String(e) };
    }
}
async function stopAll() {
    const info = findSpiderInfo();
    if (!info) {
        return { ok: false, error: "Sonic Pi no está en ejecución." };
    }
    try {
        await sendUdp(info.port, buildStopMessage(info.token));
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: String(e) };
    }
}
function isSonicPiRunning() {
    return findSpiderInfo() !== null;
}
//# sourceMappingURL=sonicPiConnection.js.map