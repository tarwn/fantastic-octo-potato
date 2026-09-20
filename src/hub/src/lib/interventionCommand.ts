// The Step id an operator command reports under, shared so the overlay can find that command's
// Transcript entry and screenshot without the Hub exposing anything else about the command.
export function interventionStepId(commandId: number): string {
	return `intervention-${commandId}`;
}
