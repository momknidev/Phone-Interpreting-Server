CREATE TABLE "mediator" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userID" uuid,
	"firstName" varchar NOT NULL,
	"lastName" varchar NOT NULL,
	"email" text,
	"phone" varchar NOT NULL,
	"address" text,
	"telephone" varchar,
	"zipCode" text,
	"fiscalCode" text,
	"IBAN" text,
	"password" varchar NOT NULL,
	"sourceLanguage1" varchar DEFAULT 'Italiano',
	"targetLanguage1" uuid,
	"sourceLanguage2" varchar,
	"targetLanguage2" uuid,
	"sourceLanguage3" varchar,
	"targetLanguage3" uuid,
	"sourceLanguage4" varchar,
	"targetLanguage4" uuid,
	"cv" varchar,
	"mediationCard" varchar,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"isActive" boolean DEFAULT true,
	"role" varchar DEFAULT 'mediator',
	"monday_time_slots" text,
	"tuesday_time_slots" text,
	"wednesday_time_slots" text,
	"thursday_time_slots" text,
	"friday_time_slots" text,
	"saturday_time_slots" text,
	"sunday_time_slots" text,
	"availableForEmergencies" boolean DEFAULT false,
	"availableOnHolidays" boolean DEFAULT false,
	"priority" numeric
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"firstName" varchar,
	"lastName" varchar,
	"email" text NOT NULL,
	"password" varchar,
	"role" varchar,
	"phone" varchar,
	"type" text,
	"avatarUrl" varchar,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mediatorId" uuid,
	"userID" uuid,
	"status" varchar(255) NOT NULL,
	"deliveryDate" timestamp NOT NULL,
	"language" text,
	"minutes" numeric DEFAULT '0',
	"notes" varchar(255) DEFAULT '',
	"amount" numeric(10, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userID" uuid,
	"language_code" integer NOT NULL,
	"language_name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "languages_language_code_unique" UNIQUE("language_code")
);
--> statement-breakpoint
ALTER TABLE "mediator" ADD CONSTRAINT "mediator_userID_users_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediator" ADD CONSTRAINT "mediator_targetLanguage1_languages_id_fk" FOREIGN KEY ("targetLanguage1") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediator" ADD CONSTRAINT "mediator_targetLanguage2_languages_id_fk" FOREIGN KEY ("targetLanguage2") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediator" ADD CONSTRAINT "mediator_targetLanguage3_languages_id_fk" FOREIGN KEY ("targetLanguage3") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediator" ADD CONSTRAINT "mediator_targetLanguage4_languages_id_fk" FOREIGN KEY ("targetLanguage4") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_mediatorId_mediator_id_fk" FOREIGN KEY ("mediatorId") REFERENCES "public"."mediator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_userID_users_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "languages" ADD CONSTRAINT "languages_userID_users_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;