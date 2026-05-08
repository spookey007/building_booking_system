import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const JWT_COOKIE = "ab_auth";

type SessionPayload = {
  userId: string;
  email: string;
  roleCodes: string[];
};

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }
  return new TextEncoder().encode(secret);
}

export async function verifyPassword(plainText: string, hash: string) {
  return bcrypt.compare(plainText, hash);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function readSessionFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify<SessionPayload>(token, getSecret());
    return verified.payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(JWT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(JWT_COOKIE);
}

export async function loginWithEmailPassword(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });
  if (!user) return null;
  if (user.status !== "ACTIVE") return null;

  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roleCodes: user.roles.map((entry) => entry.role.code),
  };
}
