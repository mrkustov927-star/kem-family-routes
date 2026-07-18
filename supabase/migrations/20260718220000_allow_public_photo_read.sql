-- Allow public visitors to load the published-photo catalogue.
-- Safe to run more than once.

grant select on public.photos to anon;
