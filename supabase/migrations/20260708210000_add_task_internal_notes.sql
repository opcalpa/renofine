-- Internal notes on tasks — mirrors rooms' internal notes. Shown in the task
-- dialog's Anteckningar tab (switch: Kundens önskemål = description / Interna
-- anteckningar = this column). Never exposed to workers: get-worker-data
-- selects explicit task columns and this one is not included.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS internal_notes text;
