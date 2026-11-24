import { auth } from "./firebase.ts";

/** Authenticate paid studio tools on the server, not just in the dashboard UI. */
export async function studioApiHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Studio sign-in required");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}
