ALTER TABLE `knowledge_doc` ADD `tags` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `knowledge_doc` ADD `is_global` integer DEFAULT false NOT NULL;