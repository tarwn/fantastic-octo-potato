export interface Customer {
	id: number;
	name: string;
}

export interface RegisteredApplicationSummary {
	id: number;
	applicationName: string;
}

export interface CustomerDetail extends Customer {
	registeredApplications: RegisteredApplicationSummary[];
}
