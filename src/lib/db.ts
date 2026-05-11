import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "driveads";

if (!uri) {
  throw new Error("MONGODB_URI is not set");
}

declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: MongoClient | undefined;
}

export const mongoClient: MongoClient =
  global.__mongoClient ?? new MongoClient(uri);

if (process.env.NODE_ENV !== "production") {
  global.__mongoClient = mongoClient;
}

export const db: Db = mongoClient.db(dbName);
