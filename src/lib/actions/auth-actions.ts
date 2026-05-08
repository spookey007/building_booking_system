"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, loginWithEmailPassword, setSessionCookie, signSession } from "@/lib/auth";
import { loginSchema } from "@/lib/validations/login";

export type LoginActionState =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function loginAction(_prevState: LoginActionState, formData: FormData) {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = Object.fromEntries(
      Object.entries(flat.fieldErrors).filter(([, v]) => Array.isArray(v) && v.length > 0),
    ) as Record<string, string[]>;
    return {
      ok: false,
      message: "Please check the form for errors.",
      fieldErrors,
    };
  }

  const { email, password } = parsed.data;
  const user = await loginWithEmailPassword(email, password);
  if (!user) {
    return { ok: false, message: "Invalid email or password." };
  }

  const token = await signSession({
    userId: user.id,
    email: user.email,
    roleCodes: user.roleCodes,
  });

  await setSessionCookie(token);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
