import { pgTable, unique, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { interpreter } from "./interpreter";
import { mediatorGroup } from "./mediator_group_table";

export const mediatorGroupRelation = pgTable(
    "mediator_group_relation",
    {
        id: uuid('id').primaryKey(),
        interpreter_id: uuid("interpreter_id")
            .notNull()
            .references(() => interpreter.id, { onDelete: "cascade" }),
        mediator_group_id: uuid("mediator_group_id")
            .notNull()
            .references(() => mediatorGroup.id, { onDelete: "cascade" }),
        created_at: timestamp("created_at"),
        updated_at: timestamp("updated_at")

    },
    // (table) => [
    //     unique("mediatorGroupRelationUnique").on(
    //         table.interpreter_id,
    //         table.mediator_group_id
    //     )
    // ]
);