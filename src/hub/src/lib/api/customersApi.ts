import type { Customer, CustomerDetail } from "$lib/types/customer";

export async function fetchCustomers(): Promise<Customer[]> {
	const response = await fetch("/api/hub/customers");
	const body = (await response.json()) as { data: Customer[] };
	return body.data;
}

export async function fetchCustomer(id: number): Promise<CustomerDetail> {
	const response = await fetch(`/api/hub/customers/${id}`);
	const body = (await response.json()) as { data: CustomerDetail } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return body.data;
}
