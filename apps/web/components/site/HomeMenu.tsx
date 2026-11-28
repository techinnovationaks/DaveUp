"use client";
// The homepage's phone menu: React Bits' StaggeredMenu in DaveUp colours.
// Phones only (the header shows the links on wider screens).
import { StaggeredMenu, type StaggeredMenuItem } from "@/components/reactbits/StaggeredMenu";
import { nextStep, useSession } from "@/lib/session";

const SECTIONS: StaggeredMenuItem[] = [
  { label: "How it works", ariaLabel: "How DaveUp works", link: "#how" },
  { label: "Features", ariaLabel: "Features", link: "#features" },
  { label: "Who it's for", ariaLabel: "Who DaveUp is for", link: "#who" },
  { label: "Pricing", ariaLabel: "Pricing", link: "#pricing" },
  { label: "FAQ", ariaLabel: "Questions and answers", link: "#faq" },
];

export function HomeMenu() {
  const { me, loading } = useSession();
  const account: StaggeredMenuItem[] =
    !loading && me
      ? [{ label: "Open DaveUp", ariaLabel: "Open the DaveUp app", link: nextStep(me) }]
      : [
          { label: "Sign in", ariaLabel: "Sign in", link: "/signin" },
          { label: "Get started", ariaLabel: "Get started free", link: "/signup" },
        ];
  return (
    <div className="dvh-sm">
      <StaggeredMenu
        isFixed
        position="right"
        items={[...SECTIONS, ...account]}
        displaySocials={false}
        displayItemNumbering
        logoUrl="/brand/daveup-logo.png"
        menuButtonColor="var(--fg)"
        changeMenuColorOnOpen={false}
        colors={["#06236B", "#01FDFF"]}
        accentColor="#0891B2"
      />
    </div>
  );
}
