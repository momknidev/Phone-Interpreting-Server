ALTER TABLE "mediator_group_relation" DROP CONSTRAINT "mediatorGroupRelationUnique";--> statement-breakpoint
ALTER TABLE "mediator_group_relation" ALTER COLUMN "mediator_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mediator_group_relation" ALTER COLUMN "mediator_group_id" SET DATA TYPE uuid;