import { adminRequest } from "../../api/admin";

// Sage (company + common) and the store database share one SQL Server and one SQL login.
export interface ConnectionSettings {
  server: string;
  username: string;
  companyDatabase: string;
  commonDatabase: string;
  stagingDatabase: string;
}

export interface SavedConnectionSettings extends ConnectionSettings {
  passwordSet: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  serverVersion?: string;
  checks: { name: string; ok: boolean; detail: string }[];
}

/** An empty password means "keep the saved one". */
type Input = ConnectionSettings & { password: string };

export const getConnections = () => adminRequest<SavedConnectionSettings>("GET", "/settings/connections");
export const saveConnections = (input: Input) => adminRequest<SavedConnectionSettings>("PUT", "/settings/connections", input);
export const testConnections = (input: Input) => adminRequest<ConnectionTestResult>("POST", "/settings/connections/test", input);
export const listDatabases = (input: Pick<Input, "server" | "username" | "password">) =>
  adminRequest<string[]>("POST", "/settings/connections/databases", input);
