-- Additive bridge for the exact production schema captured 2026-10-29.
-- Existing migrations remain unchanged. No row updates or table rebuilds.
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta` text,
	`ip` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `channel_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `channel_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `channel_follows` (
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `channel_moderators` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `community_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`parent_type` text,
	`parent_id` text,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`original_name` text NOT NULL,
	`disk_name` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `community_marks` (
	`attachment_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `community_attachments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `forum_reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `forum_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `forum_watches` (
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `forum_topics`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `music_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`composer` text,
	`stored_name` text NOT NULL,
	`mime` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`uploaded_by` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `trial_claims` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`claimed_at` text DEFAULT (current_timestamp) NOT NULL,
	`payment_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `activity_events_action_idx` ON `activity_events` (`action`);

CREATE INDEX `activity_events_created_idx` ON `activity_events` (`created_at`);

CREATE INDEX `activity_events_user_idx` ON `activity_events` (`user_id`);

CREATE INDEX `channel_comments_post_idx` ON `channel_comments` (`post_id`);

CREATE UNIQUE INDEX `channel_follows_pk` ON `channel_follows` (`user_id`,`channel_id`);

CREATE UNIQUE INDEX `channel_moderators_pk` ON `channel_moderators` (`channel_id`,`user_id`);

CREATE INDEX `community_attachments_owner_idx` ON `community_attachments` (`owner_id`);

CREATE INDEX `community_attachments_parent_idx` ON `community_attachments` (`parent_type`,`parent_id`);

CREATE UNIQUE INDEX `forum_reactions_pk` ON `forum_reactions` (`post_id`,`user_id`,`emoji`);

CREATE INDEX `forum_reactions_post_idx` ON `forum_reactions` (`post_id`);

CREATE UNIQUE INDEX `forum_watches_pk` ON `forum_watches` (`user_id`,`topic_id`);

CREATE INDEX music_tracks_status_idx ON music_tracks(status);

ALTER TABLE channel_posts ADD COLUMN comments_open INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN price_weekly INTEGER;
ALTER TABLE forum_topics ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE forum_topics ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forum_topics ADD COLUMN seminar_id TEXT REFERENCES seminars(id) ON DELETE SET NULL;
ALTER TABLE seminars ADD COLUMN kind TEXT NOT NULL DEFAULT 'seminar';
ALTER TABLE seminars ADD COLUMN meet_url TEXT;
ALTER TABLE seminars ADD COLUMN document_id TEXT REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE seminars ADD COLUMN host_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
