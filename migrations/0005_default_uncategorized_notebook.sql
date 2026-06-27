PRAGMA foreign_keys = ON;

UPDATE notebooks
SET
  name = '等待分类',
  icon = 'notebook',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'nb_inbox'
   OR slug = 'inbox';
