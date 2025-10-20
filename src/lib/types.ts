export type TimeInterval = { start: string; end: string; note?: string };

export type TimeEntry = {
  _id?: string;
  _rev?: string;
  employeeId: string;
  date: string;
  intervals: TimeInterval[];
  updatedAt: string;
};

export type AppUser = {
  _id?: string;
  email: string;
  passwordHash: string;
  role: "employee" | "reviewer" | "admin";
  createdAt: string;
  mustChangePassword?: boolean;
};

export type AuditEvent = {
  _id?: string;
  ts: string;               // ISO Zeit
  type: "login" | "password_change" | "times_write";
  actorId?: string;         // JWT sub falls vorhanden
  actorEmail?: string;
  meta?: Record<string, any>;
};
