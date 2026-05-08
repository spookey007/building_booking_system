import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#1e3a8a_0%,#2563eb_46%,#4f46e5_100%)] lg:flex lg:w-[42%] xl:w-[45%]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.22),transparent_42%),radial-gradient(circle_at_82%_84%,rgba(147,197,253,0.22),transparent_36%)]" />
        <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/85">FM Towers</p>
            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
              Command every booking, unit, and payment in one calm workspace.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85">
              Real-time portfolio view for residential towers, commercial units, and customer journeys—without the
              spreadsheet chaos.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md">
            <Image
              src="/logo.png"
              alt="FM Towers logo"
              width={700}
              height={700}
              className="h-auto w-full object-contain"
              priority
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-4 py-14 sm:px-8 dark:bg-slate-50">
        <LoginForm />
      </div>
    </main>
  );
}
