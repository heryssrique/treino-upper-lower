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

/* Treinos vão em páginas dos mais recentes para os mais antigos. SESSIONS_PAGE
   (padrão 500) existe para os testes exercitarem a paginação com poucos treinos. */
export const PAGE = Math.max(1, Math.min(500, Number(process.env.SESSIONS_PAGE) || 500));
export function sessionsPage(col, before){
  // Cursor (finishedAt, _id): dois treinos no mesmo milissegundo não se perdem na virada de página.
  const q = { deleted: { $ne: true } };
  if (before) q.$or = [{ finishedAt: { $lt: before.at } }, { finishedAt: before.at, _id: { $lt: before.id } }];
  return col.find(q).sort({ finishedAt: -1, _id: -1 }).limit(PAGE).toArray()
    .then(docs => docs.map(({ _id, ...d }) => ({ ...d, id: d.id || _id })));
}

