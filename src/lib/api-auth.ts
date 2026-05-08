import { NextResponse } from "next/server";
import { readSessionFromCookie } from "@/lib/auth";

export async function requireApiSession() {
  const session = await readSessionFromCookie();
  if (!session) {
    return { session: null as null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null as null };
}
