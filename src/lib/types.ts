export type TimeInterval = { start: string; end: string; note?: string };

export type TimeEntry = {
  _id?: string;
  _rev?: string;
  employeeId: string;
  date: string; // YYYY-MM-DD (lokale TZ)
  intervals: TimeInterval[];
  approved?: boolean;            // true = freigegeben, false = abgelehnt, undefined = offen
  approvedBy?: string;           // Reviewer-ID (JWT sub)
  approvedAt?: string;           // ISO Datum/Zeit
  deniedReason?: string;         // optionaler Ablehnungsgrund
  updatedAt: string;
};

export type AppUser = {
  _id?: string;
  email: string;
  passwordHash: string;
  role: "employee" | "reviewer" | "admin";
  createdAt: string;
  mustChangePassword?: boolean;  // muss beim 1. Login PW ändern
};
