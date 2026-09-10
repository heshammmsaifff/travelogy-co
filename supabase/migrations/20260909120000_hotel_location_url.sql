-- ============================================================================
-- Hotels: the location is ENTERED as a map link
--
-- Typing two seven-decimal numbers is a transcription task with no feedback —
-- a digit dropped from the longitude puts the hotel in the wrong governorate
-- and nothing on the screen says so. Admins have a Google Maps link in their
-- hand, so that is what the form now asks for.
--
-- `latitude` and `longitude` STAY. They are not what the admin types any more,
-- they are DERIVED from the link when it carries coordinates. A link is a
-- string; coordinates are data — a map pin, a distance sort or a "hotels near
-- the airport" search need numbers, and none of them can get numbers back out
-- of a shortened URL later. Nothing is dropped, so no existing hotel loses its
-- position.
-- ============================================================================

alter table public.hotels
  add column if not exists location_url text
    check (location_url is null or location_url ~* '^https?://');

comment on column public.hotels.location_url is
  'The map link an admin pasted. `latitude`/`longitude` are parsed out of it when it carries them — a shortened link (maps.app.goo.gl) does not, and then the coordinates stay null rather than being guessed.';
