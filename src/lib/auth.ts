import { cookies } from "next/headers";
import { verifyAccessToken, type JwtPayload } from "./jwt";

export function getAuth(): { user: JwtPayload | null } {
  const c = cookies().get("access_token");
  if (!c) return { user: null };
  try {
    const payload = verifyAccessToken(c.value);
    return { user: payload };
  } catch {
    return { user: null };
  }
}
