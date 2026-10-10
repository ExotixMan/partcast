-- Apply this file in a separate SQL Editor run before 0007.
-- PostgreSQL must commit new enum values before another migration uses them.
alter type public.app_role add value if not exists 'super_admin';
alter type public.app_role add value if not exists 'cashier';
