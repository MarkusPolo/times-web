import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET!;
if (!secret) throw new Error("JWT_SECRET missing");

// Access-Token: kurzlebig
export type JwtPayload = { sub: string; role: "employee" | "reviewer" | "admin"; email: string };
export function signAccessToken(payload: JwtPayload, expiresIn = "15m") {
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn });
}
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}

// Refresh-Token: langlebig
export type RefreshPayload = { sub: string; email: string; ver: 1 };
export function signRefreshToken(payload: RefreshPayload, expiresIn = "7d") {
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn });
}
export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, secret) as RefreshPayload;
}
