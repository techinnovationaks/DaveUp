-- Per-leader pricing (DaveUp.html, Nov 2026). An organization pays for leader
-- seats (people who disciple); each seat includes 12 members, and more members
-- come in packs of 12. Basic is free: 1 leader and up to 3 members. Cells and
-- departments are unlimited on every plan. New plan: Campus.
--
-- extra_blocks and founding are no longer used; they stay so older rows read.

ALTER TABLE church DROP CONSTRAINT church_plan_check;
ALTER TABLE church ADD CONSTRAINT church_plan_check CHECK (plan IN ('basic','standard','pro','campus','network'));
ALTER TABLE church ADD COLUMN seats integer NOT NULL DEFAULT 1 CHECK (seats >= 0);
ALTER TABLE church ADD COLUMN member_packs integer NOT NULL DEFAULT 0 CHECK (member_packs >= 0);

ALTER TABLE church_billing DROP CONSTRAINT church_billing_plan_check;
ALTER TABLE church_billing ADD CONSTRAINT church_billing_plan_check CHECK (plan IN ('basic','standard','pro','campus','network'));
ALTER TABLE church_billing DROP CONSTRAINT IF EXISTS church_billing_next_plan_check;
ALTER TABLE church_billing ADD CONSTRAINT church_billing_next_plan_check CHECK (next_plan IN ('basic','standard','pro'));
ALTER TABLE church_billing ADD COLUMN seats integer NOT NULL DEFAULT 1 CHECK (seats >= 0);
ALTER TABLE church_billing ADD COLUMN member_packs integer NOT NULL DEFAULT 0 CHECK (member_packs >= 0);
ALTER TABLE church_billing ADD COLUMN next_seats integer;
ALTER TABLE church_billing ADD COLUMN next_packs integer;

ALTER TABLE billing_payment DROP CONSTRAINT billing_payment_plan_check;
ALTER TABLE billing_payment ADD CONSTRAINT billing_payment_plan_check CHECK (plan IN ('basic','standard','pro','campus','network'));
ALTER TABLE billing_payment ADD COLUMN seats integer NOT NULL DEFAULT 1;
ALTER TABLE billing_payment ADD COLUMN member_packs integer NOT NULL DEFAULT 0;

-- Organizations already on a plan keep at least the room they had: Standard
-- had 12 disciplers, Pro 120 (Network stays unlimited). Extra blocks of 36
-- disciples become member packs of 12.
UPDATE church_billing SET
  seats = CASE plan WHEN 'standard' THEN 12 + 3 * extra_blocks WHEN 'pro' THEN 120 + 3 * extra_blocks ELSE 1 END,
  member_packs = 0
WHERE status <> 'free';
UPDATE church c SET seats = b.seats, member_packs = b.member_packs FROM church_billing b WHERE b.church_id = c.id AND b.status <> 'free';
