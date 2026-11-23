-- Plans and payments through Paystack (PRD 17.3 to 17.9).
--
-- church.plan and church.extra_blocks are what the church is entitled to right
-- now; the billing engine keeps them in step with church_billing. Requests read
-- the limits from the church row. Billing tables are only touched through the
-- owner connection (webhooks arrive without a church context), so the app role
-- gets no access to them.

ALTER TABLE church ADD COLUMN extra_blocks integer NOT NULL DEFAULT 0 CHECK (extra_blocks >= 0);

CREATE TABLE church_billing (
  church_id         uuid PRIMARY KEY REFERENCES church(id),
  plan              text NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic','standard','pro','network')),
  extra_blocks      integer NOT NULL DEFAULT 0 CHECK (extra_blocks >= 0),
  interval          text CHECK (interval IN ('month','year')),
  status            text NOT NULL DEFAULT 'free' CHECK (status IN ('free','active','canceling','grace','granted')),
  period_start      timestamptz,
  period_end        timestamptz,
  -- Full price of the current period, for the credit when upgrading mid-period.
  period_price_kobo integer NOT NULL DEFAULT 0,
  grace_until       timestamptz,
  granted_until     timestamptz,
  granted_note      text,
  -- The founding Standard price applies to periods starting before this.
  founding_until    timestamptz,
  -- A smaller plan chosen for the end of the paid period.
  next_plan         text CHECK (next_plan IN ('basic','standard')),
  next_blocks       integer,
  next_interval     text CHECK (next_interval IN ('month','year')),
  billing_email     text,
  -- Paystack card authorization for renewals. Usable only with DaveUp's secret key; never sent to browsers.
  auth_code         text,
  auth_label        text,
  paystack_customer text,
  last_attempt_at   timestamptz,
  reminded_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX church_billing_due_idx ON church_billing (status, period_end);

CREATE TABLE billing_payment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     uuid NOT NULL REFERENCES church(id),
  reference     text NOT NULL UNIQUE,
  kind          text NOT NULL CHECK (kind IN ('checkout','renewal')),
  plan          text NOT NULL CHECK (plan IN ('basic','standard','pro','network')),
  interval      text NOT NULL CHECK (interval IN ('month','year')),
  extra_blocks  integer NOT NULL DEFAULT 0,
  amount_kobo   integer NOT NULL CHECK (amount_kobo > 0),
  -- Full price of the period bought (amount_kobo is lower when an upgrade is credited).
  period_price_kobo integer NOT NULL,
  founding      boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','abandoned')),
  channel       text,
  paystack_id   bigint,
  failure       text,
  period_start  timestamptz,
  period_end    timestamptz,
  paid_at       timestamptz,
  created_by    uuid REFERENCES person(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_payment_church_idx ON billing_payment (church_id, created_at DESC);
CREATE INDEX billing_payment_pending_idx ON billing_payment (created_at) WHERE status = 'pending';

-- Every existing church starts on Basic with no billing yet, except churches
-- staff already moved to a paid plan by hand: keep those as granted.
INSERT INTO church_billing (church_id, plan, status, granted_note)
SELECT id, plan, 'granted', 'Set by DaveUp before online billing'
FROM church WHERE plan <> 'basic';
