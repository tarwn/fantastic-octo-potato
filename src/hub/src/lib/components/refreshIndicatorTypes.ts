import type { SharedComponentProps } from "./sharedComponentProps";

export interface RefreshIndicatorProps extends SharedComponentProps {
	intervalSeconds: number;
	lastRefreshedOn: Date;
	onRefresh: () => void;
}
