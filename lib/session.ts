import { cookies } from "next/headers";

export const WORKSPACE_COOKIE = "vf_ws";

export async function getWorkspaceId(): Promise<string | null> {
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/.test(value) ? value : null;
}

export async function setWorkspaceId(id: string): Promise<void> {
  (await cookies()).set(WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    // Plain-HTTP self-hosting on a LAN (e.g. a Jetson) needs COOKIE_SECURE=false.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

// Log out: forget the workspace in this browser. The data stays in the database.
export async function clearWorkspaceId(): Promise<void> {
  (await cookies()).delete(WORKSPACE_COOKIE);
}
