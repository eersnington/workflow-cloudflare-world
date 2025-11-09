CREATE TABLE `workflow_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`correlation_id` text,
	`created_at` integer NOT NULL,
	`run_id` text NOT NULL,
	`payload` text
);
--> statement-breakpoint
CREATE TABLE `workflow_hooks` (
	`run_id` text NOT NULL,
	`hook_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`environment` text NOT NULL,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`output` text,
	`deployment_id` text NOT NULL,
	`status` text NOT NULL,
	`name` text NOT NULL,
	`execution_context` text,
	`input` text NOT NULL,
	`error` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`started_at` integer
);
--> statement-breakpoint
CREATE TABLE `workflow_steps` (
	`run_id` text NOT NULL,
	`step_id` text PRIMARY KEY NOT NULL,
	`step_name` text NOT NULL,
	`status` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`error` text,
	`error_code` text,
	`attempt` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_stream_chunks` (
	`id` text NOT NULL,
	`stream_id` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	`eof` integer NOT NULL,
	PRIMARY KEY(`id`, `stream_id`)
);
--> statement-breakpoint
CREATE INDEX `events_run_id_idx` ON `workflow_events` (`run_id`);--> statement-breakpoint
CREATE INDEX `events_correlation_id_idx` ON `workflow_events` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `hooks_run_id_idx` ON `workflow_hooks` (`run_id`);--> statement-breakpoint
CREATE INDEX `hooks_token_idx` ON `workflow_hooks` (`token`);--> statement-breakpoint
CREATE INDEX `runs_workflow_name_idx` ON `workflow_runs` (`name`);--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `steps_run_id_idx` ON `workflow_steps` (`run_id`);--> statement-breakpoint
CREATE INDEX `steps_status_idx` ON `workflow_steps` (`status`);--> statement-breakpoint
CREATE INDEX `streams_stream_id_idx` ON `workflow_stream_chunks` (`stream_id`);