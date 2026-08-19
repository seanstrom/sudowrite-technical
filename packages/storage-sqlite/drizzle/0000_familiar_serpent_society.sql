CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`html` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);
