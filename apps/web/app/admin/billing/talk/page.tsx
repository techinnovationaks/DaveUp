"use client";
// "Talk to us" about Pro or Network (design 72). Emails DaveUp staff.
import { useEffect, useState } from "react";
import { PLAN_LIMITS } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, Field, H1, LinkButton, Loading, Segmented, TopBar, inputClass } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { useGuard } from "@/lib/session";

type Plan = "pro" | "network";

export default function TalkToUs() {
  const { me, ready } = useGuard("admin");
  const { busy, error, run } = useAction();
  const [plan, setPlan] = useState<Plan>("pro");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("plan") === "network") setPlan("network");
  }, []);

  if (!ready) return <Loading />;

  if (sent) {
    return (
      <ConsoleScreen narrow>
        <H1>Thank you</H1>
        <Card className="mb-6">
          <p className="text-[16px] text-ink">
            The DaveUp team has your message and will reply{me!.person.email ? ` to ${me!.person.email}` : ""} within two working days.
          </p>
        </Card>
        <LinkButton href="/admin/billing">Back to billing</LinkButton>
      </ConsoleScreen>
    );
  }

  return (
    <ConsoleScreen narrow>
      <TopBar back="/admin/billing/change" title="Talk to us" />
      <H1 sub="Tell us about your church or network. We agree Pro and Network plans with each church.">Talk to us</H1>
      <Segmented
        value={plan}
        onChange={setPlan}
        options={[
          { value: "pro", label: "Pro" },
          { value: "network", label: "Network" },
        ]}
      />
      <Card className="mb-4" tone="soft">
        <p className="text-[15px] text-ink">
          {plan === "pro"
            ? `Pro: up to ${PLAN_LIMITS.pro.disciples!.toLocaleString("en-NG")} disciples and ${PLAN_LIMITS.pro.disciplers} disciplers, a larger AI allowance, church-approved content, your own terminology and priority support.`
            : "Network: many churches under one annual agreement (at least 10), network views that respect each church's privacy, a shared content library and dedicated onboarding."}
        </p>
      </Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api("/billing/enquiry", { method: "POST", body: { plan, message, phone } });
            setSent(true);
          });
        }}
      >
        <Field label="Your message" hint="How many people, how many churches, and what you need.">
          <textarea className={`${inputClass} min-h-[140px] py-3`} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={2000} />
        </Field>
        <Field label="Phone (optional)" hint={me!.person.email ? `We reply to ${me!.person.email}.` : "Add a phone number so we can reach you."}>
          <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={me!.person.phone ?? "0803 000 0000"} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || message.trim().length < 10}>
          Send
        </Button>
      </form>
    </ConsoleScreen>
  );
}
