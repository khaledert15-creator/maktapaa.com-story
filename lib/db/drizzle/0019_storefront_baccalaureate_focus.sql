DO $$
DECLARE
  baccalaureate_stage_id integer;
BEGIN
  SELECT id INTO baccalaureate_stage_id
  FROM stages
  WHERE name_ar = 'بكالوريا'
  ORDER BY id
  LIMIT 1;

  IF baccalaureate_stage_id IS NULL THEN
    INSERT INTO stages (name_ar, name_en, sort_order, is_active)
    VALUES ('بكالوريا', 'Baccalaureate', 5, true)
    RETURNING id INTO baccalaureate_stage_id;
  ELSE
    UPDATE stages
    SET is_active = true, updated_at = now()
    WHERE id = baccalaureate_stage_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM grades
    WHERE stage_id = baccalaureate_stage_id AND name_ar = 'الأول بكالوريا'
  ) THEN
    INSERT INTO grades (name_ar, name_en, stage_id, sort_order, is_active)
    VALUES ('الأول بكالوريا', 'First Baccalaureate', baccalaureate_stage_id, 1, true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM grades
    WHERE stage_id = baccalaureate_stage_id AND name_ar = 'الثاني بكالوريا'
  ) THEN
    INSERT INTO grades (name_ar, name_en, stage_id, sort_order, is_active)
    VALUES ('الثاني بكالوريا', 'Second Baccalaureate', baccalaureate_stage_id, 2, true);
  END IF;
END $$;
