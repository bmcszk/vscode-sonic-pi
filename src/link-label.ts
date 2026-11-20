// The statusbar tempo item's label. Two pushes carry a tempo and both are the session's real
// one: /link-bpm is the engine's Link timeline tempo, /use-bpm the tempo the last run held. A
// /link-num-peers push is Link's peer count. With no tempo push the label is undefined, so the
// item stays hidden: a bpm the daemon never reported is never displayed.
export type TempoData = { linkBpm?: number; sessionBpm?: number; peers?: number }

export const formatTempoLabel = (data: TempoData): string | undefined => {
	const bpm = data.linkBpm ?? data.sessionBpm
	const bpmPart = bpm === undefined ? undefined : '$(watch) ' + bpm + ' bpm'
	const peersPart = data.peers === undefined ? undefined : '⇄' + data.peers
	return [bpmPart, peersPart].filter(Boolean).join(' · ') || undefined
}

// The setLinkBpm input box opens at the tempo already on screen, so Enter is never an error on
// an empty field. A session that reported no tempo leaves it genuinely empty.
export const linkBpmInputValue = (bpm?: number): string => (bpm === undefined ? '' : String(bpm))
