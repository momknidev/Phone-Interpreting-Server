import { pgTable, unique, uuid, text } from 'drizzle-orm/pg-core';
import { mediator } from "./mediator";
import { mediatorGroup } from "./mediator_group_table";

export const mediatorGroupRelation = pgTable(
    "mediator_group_relation",
    {
        id: uuid('id').primaryKey(),
        mediatorId: uuid("mediator_id")
            .notNull()
            .references(() => mediator.id, { onDelete: "cascade" }),
        mediatorGroupId: uuid("mediator_group_id")
            .notNull()
            .references(() => mediatorGroup.id, { onDelete: "cascade" }),
    },
    // (table) => [
    //     unique("mediatorGroupRelationUnique").on(
    //         table.mediatorId,
    //         table.mediatorGroupId
    //     )
    // ]
);