import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setFilesDir } from "./files.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { seedDemo } from "./seed.js";

const file = process.env.CRM_DB ?? fileURLToPath(new URL("../data/crm.db", import.meta.url));
const port = Number(process.env.PORT ?? 4400);
const db = openDb(file);
setFilesDir(join(dirname(file), "files"));
seedDemo(db);
createApp(db).listen(port, "127.0.0.1", () => process.stdout.write(`CRM API on http://127.0.0.1:${port} (db: ${file})\n`));
