"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LinkButton, Loading } from "@/components/ui";
import { BrandPanel, Logo } from "@/components/Shell";
import { nextStep, useSession } from "@/lib/session";

const STEPS = ["Take the 12-area assessment", "Meet regularly and follow a growth plan", "Grow, then help someone else grow"];

export default function Welcome() {
  const { me, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && me) router.replace(nextStep(me));
  }, [loading, me, router]);

  if (loading || me) return <Loading />;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-2 lg:grid-cols-[minmax(480px,560px)_1fr]">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col md:max-w-none md:px-10 md:py-10 lg:px-16">
        {/* Mobile hero. Tablet and desktop show the brand panel instead. */}
        <div className="relative flex h-[44dvh] items-center justify-center overflow-hidden bg-gradient-to-b from-brand to-[#8E0F14] md:hidden">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
          <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-white/10" />
          <p className="absolute left-6 top-6 text-[26px] font-extrabold text-white">DaveUp</p>
          <svg width="150" height="140" viewBox="0 0 24 22" aria-hidden>
            <path d="M12 21s-9-5.6-11-11.2C-.3 5.5 2.7 1 7 1c2.2 0 3.9 1.2 5 2.8C13.1 2.2 14.8 1 17 1c4.3 0 7.3 4.5 6 8.8C21 15.4 12 21 12 21z" fill="#fff" fillOpacity=".95" />
            <path d="M12 6v9M8.8 9.4h6.4" stroke="#D71920" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="mb-10 hidden md:block">
          <Logo />
        </div>

        <div className="flex flex-1 flex-col px-6 pb-10 pt-8 md:my-auto md:max-w-[440px] md:flex-none md:p-0">
          {/* Mobile copy; on larger screens the brand panel carries it. */}
          <div className="md:hidden">
            <span className="mb-4 inline-block w-fit rounded-full bg-brand px-4 py-1.5 text-[13px] font-extrabold uppercase tracking-widest text-white">Discipleship</span>
            <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight text-ink">Walk with someone. Make disciples.</h1>
            <p className="mt-3 text-[17px] text-ink-muted">One discipler, one clear next step, together.</p>
            <ol className="mt-5 space-y-3">
              {STEPS.map((t, i) => (
                <li key={t} className="flex items-center gap-3 text-[16px] text-ink">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[14px] text-ink-muted">Provided through your church.</p>
          </div>

          <div className="hidden md:block">
            <h1 className="text-[36px] font-extrabold leading-tight tracking-tight text-ink">Welcome to DaveUp</h1>
            <p className="mt-3 text-[17px] text-ink-muted">Sign in with your phone number to continue.</p>
          </div>

          <div className="mt-auto space-y-3 pt-8 md:mt-0">
            <LinkButton href="/signin" full>
              Get started
            </LinkButton>
            <Link href="/signin" className="block py-2 text-center text-[16px] font-semibold text-ink hover:text-brand">
              I already have an account
            </Link>
          </div>
          <p className="mt-8 hidden border-t border-surface-line pt-6 text-[15px] text-ink-muted md:block">
            Church administrator or pastor? Sign in, then choose <span className="font-semibold text-ink">Register a church</span>.
          </p>
        </div>
      </main>
      <BrandPanel className="sticky top-0 hidden h-dvh md:block" />
    </div>
  );
}
