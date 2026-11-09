import { adminRequest } from "../../api/admin";

// The company's own details printed at the top of every quotation. Saved by the store backend.

export interface Company {
  name: string;
  /** Four address lines; empty lines are skipped on the print. */
  address: string[];
  taxNumber: string;
  telephone: string;
  fax: string;
  email: string;
  /** Optional text at the bottom of the quotation, e.g. bank details or validity. */
  footer: string;
}

export const getCompany = () => adminRequest<Company>("GET", "/settings/company");
export const saveCompany = (company: Company) => adminRequest<Company>("PUT", "/settings/company", company);
