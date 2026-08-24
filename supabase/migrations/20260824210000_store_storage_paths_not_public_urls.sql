-- Rewrite stored `/object/public/project-files/...` URLs to bare storage paths.
--
-- The app now signs every file reference on read (src/lib/fileUrl.ts,
-- supabase/functions/_shared/fileUrl.ts). Both readers accept a path or a
-- legacy URL, so this migration is data hygiene ahead of closing the bucket:
-- afterwards no publicly-fetchable URL for a user's file is left in the
-- database at all.
--
-- REVERT (paths are prefixed back into public URLs):
--   update photos set url = 'https://pfyxywuchbakuphxhgec.supabase.co/storage/v1/object/public/project-files/' || url
--    where url not like 'http%' and url <> '';
--   update projects set cover_image_url = 'https://pfyxywuchbakuphxhgec.supabase.co/storage/v1/object/public/project-files/' || cover_image_url
--    where cover_image_url not like 'http%' and cover_image_url <> '';
-- (Reverting is only meaningful together with reverting the code; readers
--  handle both forms, so a revert is not required to restore service.)

-- Percent-decoding: stored URLs encode spaces ("Uppladdade%20filer") and the
-- storage API expects the decoded path.
create or replace function pg_url_decode(input text)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select convert_from(
        decode(
          string_agg(
            case
              when length(m[1]) = 3 and left(m[1], 1) = '%' then substring(m[1] from 2)
              else encode(convert_to(m[1], 'UTF8'), 'hex')
            end,
            ''
          ),
          'hex'
        ),
        'UTF8'
      )
      from regexp_matches(input, '%[0-9a-fA-F]{2}|.', 'g') as m
    ),
    input
  );
$$;

-- Strip everything up to and including the bucket name, drop any query string,
-- then percent-decode what is left.
create or replace function pg_public_url_to_path(input text)
returns text
language sql
immutable
as $$
  select case
    when input is null then null
    when input not like '%/storage/v1/object/public/project-files/%' then input
    else pg_url_decode(
      split_part(
        split_part(input, '/storage/v1/object/public/project-files/', 2),
        '?', 1
      )
    )
  end;
$$;

update photos
   set url = pg_public_url_to_path(url)
 where url like '%/storage/v1/object/public/project-files/%';

update projects
   set cover_image_url = pg_public_url_to_path(cover_image_url)
 where cover_image_url like '%/storage/v1/object/public/project-files/%';

-- Canvas background images live in the shape JSON.
update floor_map_shapes
   set shape_data = jsonb_set(
         shape_data,
         '{imageUrl}',
         to_jsonb(pg_public_url_to_path(shape_data->>'imageUrl'))
       )
 where shape_data->>'imageUrl' like '%/storage/v1/object/public/project-files/%';

-- Comment attachments are a JSON array of {id, url, filename}.
update comments c
   set images = sub.rebuilt
  from (
    select c2.id,
           jsonb_agg(
             case
               when img->>'url' like '%/storage/v1/object/public/project-files/%'
                 then jsonb_set(img, '{url}', to_jsonb(pg_public_url_to_path(img->>'url')))
               else img
             end
             order by ord
           ) as rebuilt
      from comments c2,
           lateral jsonb_array_elements(c2.images) with ordinality as t(img, ord)
     where jsonb_typeof(c2.images) = 'array'
       and c2.images::text like '%/storage/v1/object/public/project-files/%'
     group by c2.id
  ) as sub
 where c.id = sub.id;

drop function if exists pg_public_url_to_path(text);
drop function if exists pg_url_decode(text);
