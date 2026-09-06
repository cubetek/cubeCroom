CREATE TABLE `lesson_workspaces` (
	`lesson_id` text PRIMARY KEY NOT NULL,
	`preparation` text NOT NULL,
	`activity_id` text,
	`undo_token` text,
	`undo_snapshot` text,
	`applied_fingerprint` text,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE set null
);
