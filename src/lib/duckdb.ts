"use client";

import * as duckdb from "@duckdb/duckdb-wasm";
import type { Row, Warehouse } from "./types";

const rel = (p: string) => new URL(p, document.baseURI).href;

function arrowToObjects(table: { schema: { fields: { name: string }[] }; toArray: () => Iterable<{ toJSON?: () => Record<string, unknown> }> }): Row[] {
  const fields = table.schema.fields.map((f: { name: string }) => f.name);
  const out: Row[] = [];
  for (const record of table.toArray()) {
    const json = (record as { toJSON?: () => Record<string, unknown> }).toJSON?.() ?? record;
    const row: Row = {};
    for (const f of fields) {
      const v = (json as Record<string, unknown>)[f];
      if (typeof v === "bigint") row[f] = Number(v);
      else if (v instanceof Date) row[f] = v.toISOString().slice(0, 10);
      else if (v !== null && typeof v === "object" && "toString" in (v as object)) {
        // Decimal128 and other exotic Arrow types -> plain string -> number
        const s = String(v);
        row[f] = Number.isNaN(Number(s)) ? s : Number(s);
      } else {
        row[f] = v as Row[string];
      }
    }
    out.push(row);
  }
  return out;
}

/**
 * Opens the embedded warehouse in the browser.
 *
 * The warehouse is a DuckDB database file built offline by
 * scripts/build_warehouse.py from the SQL models in /models. We ship that
 * file to the browser, attach it read-only, and every view (and the
 * plain-English question box) runs real SQL against it via duckdb-wasm.
 */
export async function openWarehouse(onStage: (msg: string) => void): Promise<Warehouse> {
  onStage("Loading the SQL engine (duckdb-wasm)…");
  const bundle = await duckdb.selectBundle({
    mvp: {
      mainModule: rel("vendor/duckdb/duckdb-mvp.wasm"),
      mainWorker: rel("vendor/duckdb/duckdb-browser-mvp.worker.js"),
    },
    eh: {
      mainModule: rel("vendor/duckdb/duckdb-eh.wasm"),
      mainWorker: rel("vendor/duckdb/duckdb-browser-eh.worker.js"),
    },
  });
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(
    new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
    worker
  );
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  onStage("Fetching the warehouse (warehouse.duckdb, ~4 MB)…");
  const res = await fetch(rel("data/warehouse.duckdb"));
  if (!res.ok) throw new Error(`Could not fetch data/warehouse.duckdb: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  await db.registerFileBuffer("warehouse.duckdb", new Uint8Array(buf));

  onStage("Attaching warehouse (staging · dimensions · marts)…");
  const conn = await db.connect();
  await conn.query("ATTACH 'warehouse.duckdb' AS wh (READ_ONLY)");

  const run = async (sql: string): Promise<Row[]> => {
    const table = await conn.query(sql);
    return arrowToObjects(table);
  };

  const meta = await run(
    "SELECT MAX(year_quarter) AS as_of FROM wh.mart_revenue_product_line_quarter"
  );
  const quarters = (
    await run(
      "SELECT DISTINCT year_quarter FROM wh.mart_revenue_product_line_quarter ORDER BY 1"
    )
  ).map((r) => String(r.year_quarter));

  onStage("Ready — querying marts.");
  return {
    run,
    asOfQuarter: String(meta[0]?.as_of ?? ""),
    quarters,
    close: async () => {
      await conn.close();
      await db.terminate();
      worker.terminate();
    },
  };
}
