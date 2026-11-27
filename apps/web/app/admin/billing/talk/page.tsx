"use client";
// "Talk to us" about Pro or Network (design 72). Emails DaveUp staff.
import { useEffect, useState } from "react";
import { PLAN_INFO, naira } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, Field, H1, LinkButton, Loading, Segmented, TopBar, inputClass } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { useGuard } from "@/lib/session";

type Plan = "campus" | "network";

export default function TalkToUs() {
  const { me, ready } = useGuard("admin");
  const { busy, error, run } = useAction();
  const [plan, setPlan] = useState<Plan>("campus");
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
      <H1 sub="Tell us about your fellowship, organization or network. We agree Campus and Network plans with each one.">Talk to us</H1>
      <Segmented
        value={plan}
        onChange={setPlan}
        options={[
          { value: "campus", label: "Campus" },
          { value: "network", label: "Network" },
        ]}
      />
      <Card className="mb-4" tone="soft">
        <p className="text-[15px] text-ink">
          {plan === "campus"
            ? `Campus: Standard features at a student rate, ${naira(PLAN_INFO.campus.leaderMonthKobo)} per leader a month, from ${PLAN_INFO.campus.minLeaders} leaders. For campus fellowships and student groups.`
            : `Network: denominations, ministries and training programs on an annual contract, from ${naira(PLAN_INFO.network.leaderMonthKobo)} per leader a month and at least ${PLAN_INFO.network.minLeaders} leaders. Shared reporting across organizations.`}
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
        <Field label="Your message" hint="How many people, how many organizations, and what you need.">
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
