CREATE TABLE `agent_effects` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`result` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`class_id` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_memory_scope` ON `agent_memories` (`class_id`,`agent_id`);--> statement-breakpoint
CREATE TABLE `agent_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`events` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_run_scope` ON `agent_runs` (`class_id`,`status`);--> statement-breakpoint
CREATE TABLE `learning_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`lesson_id` text,
	`version` integer NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`material` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `learning_class_idx` ON `learning_experiences` (`class_id`);--> statement-breakpoint
CREATE TABLE `learning_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL,
	`version` integer NOT NULL,
	`material` text NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `learning_experiences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_version_unique` ON `learning_versions` (`experience_id`,`version`);--> statement-breakpoint
CREATE TABLE `practice_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`item_id` text NOT NULL,
	`response` text NOT NULL,
	`feedback` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_session_item` ON `practice_attempts` (`session_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL,
	`student_id` text NOT NULL,
	`version` integer NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `learning_experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_student_experience` ON `practice_sessions` (`student_id`,`experience_id`);