CREATE TABLE IF NOT EXISTS `rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `state` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `seen_r` integer DEFAULT 0 NOT NULL,
  `seen_b` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rooms_expires_at_idx` ON `rooms` (`expires_at`);
