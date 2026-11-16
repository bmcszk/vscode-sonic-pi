// Pure label for the Link statusbar item: '♪ 122.4 · ⇄3'. No data yet -> undefined,
// so the item stays hidden until the daemon's first /link push arrives.
export const formatLinkLabel = (bpm?: number, peers?: number): string | undefined => {
	if (bpm === undefined && peers === undefined) return undefined
	const bpmPart = bpm === undefined ? undefined : '♪ ' + bpm
	const peersPart = peers === undefined ? undefined : '⇄' + peers
	return [bpmPart, peersPart].filter(Boolean).join(' · ')
}

// The setLinkBpm input box always opens with a full number, so Enter is never an error on
// an empty field; 60 is Link's own default tempo when no push has arrived yet.
export const linkBpmInputValue = (bpm?: number): string => String(bpm ?? 60)
}
