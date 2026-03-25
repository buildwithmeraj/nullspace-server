import mongoose, { Model, Schema } from "mongoose";
import config from "../config";

export async function connectDatabase() {
  // Ensure the MongoDB connection string is configured before trying to connect.
  if (!config.database_url) {
    throw new Error("Database URL is not provided in environment variables");
  }

  // Establish (or reuse) the default mongoose connection. `dbName` selects the
  // default database on that connection.
  await mongoose.connect(config.database_url, {
    dbName: config.database_name || undefined,
  });

  return mongoose.connection;
}

export function getDbConnection(dbName?: string) {
  // return the same db-scoped connection.
  const baseConnection = mongoose.connection;
  if (!dbName) return baseConnection;
  return baseConnection.useDb(dbName, { useCache: true });
}

export function getDbModel<TSchema>(
  modelName: string,
  schema: Schema<TSchema>,
  dbName?: string,
): Model<TSchema> {
  // db-scoped connection.
  const connection = getDbConnection(dbName);
  return (
    (connection.models[modelName] as Model<TSchema> | undefined) ??
    connection.model<TSchema>(modelName, schema)
  );
}
