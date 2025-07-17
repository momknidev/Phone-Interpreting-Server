CREATE TABLE "mediator_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userID" uuid,
	"groupName" varchar NOT NULL,
	"status" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mediator_group_relation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mediator_id" integer NOT NULL,
	"mediator_group_id" integer NOT NULL,
	CONSTRAINT "mediator_group_relation_mediator_id_mediator_group_id_unique" UNIQUE("mediator_id","mediator_group_id")
);
--> statement-breakpoint
ALTER TABLE "mediator" ALTER COLUMN "sourceLanguage1" SET DEFAULT 'Italian';--> statement-breakpoint
ALTER TABLE "mediator" ADD COLUMN "status" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" varchar DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "mediator_group" ADD CONSTRAINT "mediator_group_userID_users_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediator_group_relation" ADD CONSTRAINT "mediator_group_relation_mediator_id_mediator_id_fk" FOREIGN KEY ("mediator_id") REFERENCES "public"."mediator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediator_group_relation" ADD CONSTRAINT "mediator_group_relation_mediator_group_id_mediator_group_id_fk" FOREIGN KEY ("mediator_group_id") REFERENCES "public"."mediator_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "telephone";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "zipCode";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "fiscalCode";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "password";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "cv";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "notes";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "isActive";--> statement-breakpoint
ALTER TABLE "mediator" DROP COLUMN "role";