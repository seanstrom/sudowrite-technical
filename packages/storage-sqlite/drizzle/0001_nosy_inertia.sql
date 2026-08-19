ALTER TABLE `documents` RENAME COLUMN "html" TO "content";
--> statement-breakpoint
UPDATE `documents`
SET `content` = json_object(
  'type', 'doc',
  'content', json_array(
    json_object(
      'type', 'paragraph',
      'content', json_array(json_object('type', 'text', 'text', `content`))
    )
  )
)
WHERE json_valid(`content`) = 0;
