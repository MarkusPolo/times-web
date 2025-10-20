import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export type AccessPayload = {
  sub: string;
  email: string;
  role: "employee" | "reviewer" | "admin";
};

export type RefreshPayload = {
  sub: string;
  email: string;
  ver: number; // Rotation-Version
};

export function signAccessToken(payload: AccessPayload, expiresIn: string | number = "15m") {
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", expiresIn });
}

export function verifyAccessToken(token: string): AccessPayload & jwt.JwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as any;
}

export function signRefreshToken(payload: RefreshPayload, expiresIn: string | number = "7d") {
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", expiresIn });
}

export function verifyRefreshToken(token: string): RefreshPayload & jwt.JwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as any;
}
