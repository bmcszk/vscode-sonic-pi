import * as fs from 'fs'
import * as path from 'path'
import { ChildProcess, spawn } from 'child_process'
import * as vscode from 'vscode'

export type LspState = 'stopped' | 'starting' | 'ready' | 'restarting' | 'degraded'

export interface LspClientOptions {
	serverPath: string
	workspaceFolderUri: string
	respawnBackoffMs?: number
	maxRespawns?: number
	killGraceMs?: number
	onSpawn?: () => void
}

const DUMMY_BUNDLE_GEMFILE = 'vscode-sonic-pi-dummy-Gemfile'

const executableExists = (candidate: string): boolean => {
	try {
		fs.accessSync(candidate, fs.constants.X_OK)
		return fs.statSync(candidate).isFile()
	} catch {
		return false
	}
}

export const discoverRubyLsp = (override: string | undefined, pathEntry: string): string | null => {
	if (override && executableExists(override)) return override
	if (!pathEntry) return null
	for (const dir of pathEntry.split(path.delimiter)) {
		if (!dir) continue
		const candidate = path.join(dir, 'ruby-lsp')
		if (executableExists(candidate)) return candidate
	}
	return null
}

export const resolveRubyLspPathFromConfig = (): string | null => {
	const override = vscode.workspace.getConfiguration('vscode-sonic-pi').get('rubyLspPath') as
		string | undefined
	return discoverRubyLsp(override, process.env.PATH ?? '')
}

const percentEncodeUri = (workspacePath: string): string =>
	encodeURI('file://' + workspacePath).replace(/[#?]/g, (c) => encodeURIComponent(c))

interface JsonRpcMessage {
	id?: number
	method?: string
	params?: unknown
	result?: unknown
}

const encodeMessage = (message: JsonRpcMessage): string => {
	// LSP base protocol: every message is prefixed with an ASCII header block ending in
	// \r\n\r\n; the body length is in BYTES, not characters.
	const body = JSON.stringify(message)
	return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

const initializeParams = (workspaceUri: string) => ({
	processId: process.pid,
	workspaceFolders: [{ uri: workspaceUri, name: path.basename(workspaceUri) }],
	documentSelector: [{ language: 'sonic-pi', scheme: 'file' }],
	capabilities: {},
})

const backoffDelay = (attempt: number, baseMs: number): number => baseMs * Math.pow(2, attempt)

const isBundlerMissingError = (output: string): boolean =>
	output.includes('cannot load such file -- bundler') || output.includes('require "bundler"')

export class LspClient {
	state: LspState = 'stopped'
	serverPid: number | undefined
	spawnCount = 0
	isAvailable = true
	readonly disposed: Promise<void>

	private readonly options: Required<
		Omit<LspClientOptions, 'serverPath' | 'workspaceFolderUri' | 'onSpawn'>
	> &
		LspClientOptions
	private server: ChildProcess | undefined
	private killTimer: ReturnType<typeof setTimeout> | undefined
	private resolveDisposed: (() => void) | undefined
	private stopRequested = false

	constructor(options: LspClientOptions) {
		this.options = {
			respawnBackoffMs: 500,
			maxRespawns: 3,
			killGraceMs: 2000,
			...options,
		}
		this.disposed = new Promise((resolve) => {
			this.resolveDisposed = resolve
		})
	}

	async start(): Promise<void> {
		this.stopRequested = false
		this.state = 'starting'
		await this.spawnServer()
	}

	async dispose(): Promise<void> {
		this.stopRequested = true
		this.state = 'stopped'
		await this.killServer()
		this.resolveDisposed?.()
	}

	private async spawnServer(): Promise<void> {
		if (this.stopRequested) return
		this.spawnCount++
		this.options.onSpawn?.()
		const server = spawn(this.options.serverPath, [], {
			cwd: this.options.workspaceFolderUri,
			env: {
				...process.env,
				BUNDLE_GEMFILE: path.join(this.options.workspaceFolderUri, DUMMY_BUNDLE_GEMFILE),
			},
			stdio: ['pipe', 'pipe', 'pipe'],
		})
		this.server = server
		this.serverPid = server.pid
		server.on('exit', () => this.onServerExit())
		server.stdout?.on('data', (chunk) => this.onServerStdout(chunk))
		server.stderr?.on('data', (chunk) => {
			this.lastStderr += chunk
		})
		await this.performHandshake()
		if (this.stopRequested) return
		this.state = 'ready'
	}

	private async performHandshake(): Promise<void> {
		await this.sendRequest(
			'initialize',
			initializeParams(percentEncodeUri(this.options.workspaceFolderUri)),
		)
		this.sendNotification('initialized', {})
	}

	request(method: string, params: unknown): Promise<unknown> {
		return this.sendRequest(method, params)
	}

	private sendRequest(method: string, params: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method} reply`)), 5000)
			this.pendingReplies.push((result) => {
				clearTimeout(timer)
				resolve(result)
			})
			this.writeMessage({ id: this.nextRequestId++, method, params })
		})
	}

	private pendingReplies: Array<(result: unknown) => void> = []
	private nextRequestId = 1

	sendNotification(method: string, params: unknown): void {
		this.writeMessage({ method, params })
	}

	private writeMessage(message: JsonRpcMessage): void {
		this.server?.stdin?.write(encodeMessage(message))
	}

	private stdoutBuffer = Buffer.alloc(0)

	private onServerStdout(chunk: Buffer): void {
		this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk])
		for (;;) {
			const separator = this.stdoutBuffer.indexOf('\r\n\r\n')
			if (separator < 0) break
			const header = this.stdoutBuffer.slice(0, separator).toString()
			const match = header.match(/Content-Length: (\d+)/i)
			if (!match) {
				this.stdoutBuffer = this.stdoutBuffer.slice(separator + 4)
				continue
			}
			const length = parseInt(match[1], 10)
			const bodyStart = separator + 4
			if (this.stdoutBuffer.length < bodyStart + length) break
			const body = this.stdoutBuffer.slice(bodyStart, bodyStart + length).toString()
			this.stdoutBuffer = this.stdoutBuffer.slice(bodyStart + length)
			if (!body.trim()) continue
			this.dispatchMessage(JSON.parse(body) as JsonRpcMessage)
		}
	}

	private dispatchMessage(message: JsonRpcMessage): void {
		if (message.id !== undefined && this.pendingReplies.length > 0) {
			this.pendingReplies.shift()?.(message.result)
		}
	}

	private lastStderr = ''

	private onServerExit(): void {
		this.server = undefined
		this.serverPid = undefined
		this.rejectPendingReplies()
		if (this.stopRequested || this.state === 'stopped') return
		// stderr data can arrive after the exit event; let it drain before classifying
		setTimeout(() => this.classifyExit(), 25)
	}

	private classifyExit(): void {
		if (this.stopRequested || this.state === 'stopped') return
		if (isBundlerMissingError(this.lastStderr)) {
			this.state = 'degraded'
			this.isAvailable = false
			this.resolveDisposed?.()
			return
		}
		this.respawn()
	}

	private respawn(): void {
		const respawnIndex = this.spawnCount - 1
		if (respawnIndex >= this.options.maxRespawns) {
			this.state = 'degraded'
			this.resolveDisposed?.()
			return
		}
		this.state = 'restarting'
		const delay = backoffDelay(respawnIndex, this.options.respawnBackoffMs)
		setTimeout(() => {
			this.spawnServer().catch(() => this.enterDegraded())
		}, delay)
	}

	private rejectPendingReplies(): void {
		for (const resolve of this.pendingReplies) resolve(undefined)
		this.pendingReplies = []
	}

	private enterDegraded(): void {
		this.state = 'degraded'
		this.resolveDisposed?.()
	}

	private async killServer(): Promise<void> {
		const server = this.server
		if (!server || server.pid === undefined) return
		this.server = undefined
		this.serverPid = undefined
		await new Promise<void>((resolve) => {
			const done = () => {
				if (this.killTimer) clearTimeout(this.killTimer)
				this.killTimer = undefined
				resolve()
			}
			server.once('exit', done)
			server.kill('SIGTERM')
			this.killTimer = setTimeout(() => {
				server.kill('SIGKILL')
				server.once('exit', done)
			}, this.options.killGraceMs)
		})
	}
}
