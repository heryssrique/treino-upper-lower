// Conexão com o MongoDB reaproveitada entre chamadas da mesma função serverless.
import { MongoClient } from "mongodb";

let clientPromise = null;
let indexesReady = null;

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI não configurada");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
      .connect()
      .catch(err => { clientPromise = null; throw err; });
  }
  const db = (await clientPromise).db(process.env.MONGODB_DB || "treino");
  indexesReady ||= db.collection("sessions")
    .createIndex({ finishedAt: -1 })
    .catch(err => { indexesReady = null; throw err; });
  await indexesReady;
  return db;
}

// Só para testes: encerra a conexão.
export async function closeDb() {
  if (clientPromise) { await (await clientPromise).close(); clientPromise = null; indexesReady = null; }
}
