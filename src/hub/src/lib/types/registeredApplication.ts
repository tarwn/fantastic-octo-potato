export interface RegisteredApplication {
	id: number;
	customerName: string;
	applicationName: string;
}

export interface RunnerSummary {
	id: number;
	lastHeartbeatOn: Date | null;
	currentJobId: number | null;
}

export interface RegisteredApplicationDetail extends RegisteredApplication {
	runners: RunnerSummary[];
}
