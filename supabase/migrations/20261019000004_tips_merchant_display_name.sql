-- Merchant name shown to donors on the tip page.
--
-- PayWay and Bakong both embed their own merchant name inside the QR payload
-- (EMVCo tag 59) and neither API lets a merchant override it. This column is
-- what our tip page prints alongside the QR, so the name donors see can be
-- set to whatever the PayWay outlet is called -- e.g. "CHEA LYHENG 1".
alter table public.creator_tip_settings
  add column if not exists merchant_display_name text;

-- Seed existing creators from their profile display name.
update public.creator_tip_settings as cts
set merchant_display_name = coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''))
from public.profiles as p
where p.id = cts.creator_id
  and (cts.merchant_display_name is null or trim(cts.merchant_display_name) = '');