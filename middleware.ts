import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const protectedPrefixes = ["/dashboard"];
const authPrefixes = ["/login"];

async function isAuthenticated(request: NextRequest) {
  const token = request.cookies.get("ab_auth")?.value;
  if (!token) return false;
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loggedIn = await isAuthenticated(request);

  const needsAuth = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = authPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (needsAuth && !loggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthPage && loggedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
