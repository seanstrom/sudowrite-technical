import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content", { mode: "json" }).$type<Readonly<{
    type: "doc";
    content?: ReadonlyArray<unknown> | undefined;
  }>>().notNull(),
  revision: integer("revision").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const dataMigrations = sqliteTable("app_data_migrations", {
  id: text("id").primaryKey(),
  appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull(),
});
