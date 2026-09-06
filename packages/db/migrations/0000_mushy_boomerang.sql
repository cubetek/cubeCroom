CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`lesson_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`student_ai_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activities_class_status_idx` ON `activities` (`class_id`,`status`);--> statement-breakpoint
CREATE TABLE `activity_files` (
	`activity_id` text NOT NULL,
	`file_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_files_pk` ON `activity_files` (`activity_id`,`file_id`);--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`default_model` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`connected_at` integer,
	`last_checked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_providers_provider_unique` ON `ai_providers` (`provider`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`requests` integer DEFAULT 0 NOT NULL,
	`tokens` integer,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_occurred_idx` ON `ai_usage` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`question_id` text NOT NULL,
	`option_id` text,
	`text` text,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `question_options`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_submission_question` ON `answers` (`submission_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`detail` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_occurred_idx` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text,
	`level` text,
	`description` text,
	`archived_at` integer,
	`student_ai_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `classes_archived_idx` ON `classes` (`archived_at`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_name` text NOT NULL,
	`sha256` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_name_unique` ON `files` (`storage_name`);--> statement-breakpoint
CREATE TABLE `join_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`identifier` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`student_id` text,
	`decided_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `join_requests_session_idx` ON `join_requests` (`session_id`);--> statement-breakpoint
CREATE INDEX `join_requests_status_idx` ON `join_requests` (`status`);--> statement-breakpoint
CREATE TABLE `lesson_files` (
	`lesson_id` text NOT NULL,
	`file_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_files_pk` ON `lesson_files` (`lesson_id`,`file_id`);--> statement-breakpoint
CREATE TABLE `lesson_reads` (
	`lesson_id` text NOT NULL,
	`student_id` text NOT NULL,
	`read_at` integer NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_reads_pk` ON `lesson_reads` (`lesson_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`blocks` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lessons_class_status_idx` ON `lessons` (`class_id`,`status`);--> statement-breakpoint
CREATE TABLE `question_options` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`text` text NOT NULL,
	`is_correct` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_options_question_idx` ON `question_options` (`question_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`expected_answer` text,
	`points` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_activity_idx` ON `questions` (`activity_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`invite_token` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_invite_token_unique` ON `sessions` (`invite_token`);--> statement-breakpoint
CREATE INDEX `sessions_class_idx` ON `sessions` (`class_id`);--> statement-breakpoint
CREATE INDEX `sessions_ended_idx` ON `sessions` (`ended_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`issued_at` integer NOT NULL,
	`revoked_at` integer,
	`last_seen_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_sessions_token_hash_unique` ON `student_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `student_sessions_session_idx` ON `student_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `student_sessions_student_idx` ON `student_sessions` (`student_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`name` text NOT NULL,
	`identifier` text,
	`approved_at` integer NOT NULL,
	`removed_at` integer,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `students_class_idx` ON `students` (`class_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`student_id` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`score` integer,
	`comment` text,
	`reviewed_at` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submissions_status_idx` ON `submissions` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_activity_student` ON `submissions` (`activity_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `teacher` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
