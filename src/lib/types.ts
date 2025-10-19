export type TimeInterval = { start: string; end: string; note?: string };
export type TimeEntry = {
  _id?: string;
  _rev?: string;
  employeeId: string;
  date: string; // YYYY-MM-DD (lokale TZ)
  intervals: TimeInterval[];
  approved?: boolean;
  approvedBy?: string;
  updatedAt: string;
};

export type AppUser = {
  _id?: string;
  email: string;
  passwordHash: string;
  role: "employee" | "reviewer" | "admin";
  createdAt: string;
};
