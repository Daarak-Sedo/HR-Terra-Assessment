export interface User {
  userId: string;
  companyId: string | null;
  role:
    | "PLATFORM_ADMIN"
    | "COMPANY_ADMIN"
    | "HR_MANAGER"
    | "PAYROLL_MANAGER"
    | "EMPLOYEE";
  employeeId: string | null;
  name: string;
  email: string;
}
export interface Employee {
  _id: string;
  employeeNumber: string;
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  status: string;
  employmentType: string;
  shiftStart: string;
}
export interface Candidate {
  _id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  status: string;
}
export interface Payroll {
  _id: string;
  period: string;
  status: string;
  totalCents: number;
}
export interface Wallet {
  _id: string;
  ownerName: string;
  balanceCents: number;
  currency: string;
}
export interface Ticket {
  _id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  source: string;
  createdAt: string;
}
export interface Dashboard {
  employees: number;
  activeEmployees: number;
  openCandidates: number;
  checkedIn: number;
  late: number;
  currentPayroll: Payroll | null;
  openTickets: number;
  cameraReview: number;
  walletBalanceCents: number | null;
  currency: string;
}

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
export async function request<T>(
  path: string,
  init: RequestInit = {},
  companyId?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (companyId) headers.set("X-Company-Id", companyId);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const result = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(result.error?.message ?? "Request failed");
  return result;
}
export const money = (cents: number, currency = "AED"): string =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
