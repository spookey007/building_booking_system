import { cache } from "react";
import { db } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";

export const getCurrentSession = cache(async () => {
  return readSessionFromCookie();
});

export const getCurrentUserWithRoles = cache(async () => {
  const session = await getCurrentSession();
  if (!session?.userId) return null;

  return db.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });
});
