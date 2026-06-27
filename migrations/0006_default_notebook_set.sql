PRAGMA foreign_keys = ON;

UPDATE notebooks
SET
  name = '工作项目',
  slug = 'work-projects',
  icon = 'notebook',
  color = '#2563eb',
  sort_order = 20,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'nb_projects'
  AND is_deleted = 0;

INSERT INTO notebooks (id, parent_id, name, slug, icon, color, sort_order)
SELECT 'nb_projects', NULL, '工作项目', 'work-projects', 'notebook', '#2563eb', 20
WHERE NOT EXISTS (
  SELECT 1 FROM notebooks WHERE id = 'nb_projects' OR slug = 'work-projects'
);

INSERT INTO notebooks (id, parent_id, name, slug, icon, color, sort_order)
SELECT 'nb_learning', NULL, '学习资料', 'learning-resources', 'notebook', '#7c3aed', 30
WHERE NOT EXISTS (
  SELECT 1 FROM notebooks WHERE id = 'nb_learning' OR slug = 'learning-resources'
);

INSERT INTO notebooks (id, parent_id, name, slug, icon, color, sort_order)
SELECT 'nb_creative', NULL, '灵感创作', 'creative-ideas', 'notebook', '#db2777', 40
WHERE NOT EXISTS (
  SELECT 1 FROM notebooks WHERE id = 'nb_creative' OR slug = 'creative-ideas'
);

INSERT INTO notebooks (id, parent_id, name, slug, icon, color, sort_order)
SELECT 'nb_personal', NULL, '生活个人', 'personal-life', 'notebook', '#ea580c', 50
WHERE NOT EXISTS (
  SELECT 1 FROM notebooks WHERE id = 'nb_personal' OR slug = 'personal-life'
);
