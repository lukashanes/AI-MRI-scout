/**
 * IndexedDB-based analysis history.
 * Stores past analysis results for later review.
 */

import type { ValidatedAnalysis } from "./schema";

const DB_NAME = "mri-scout";
const DB_VERSION = 1;
const STORE_NAME = "analyses";

export interface HistoryEntry {
  id: string;
  date: string;
  imageCount: number;
  recommendation: string;
  summary: string;
  analysis: ValidatedAnalysis;
  deepDive: ValidatedAnalysis | null;
  duration: number;
  auditTrail?: Array<{
    id: string;
    pass: string;
    provider: string;
    imageCount: number;
    status: "completed" | "error";
    durationMs?: number;
    recommendation?: string;
    structures?: string[];
    summary?: string;
    error?: string;
    selectedFiles?: string[];
  }>;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAnalysis(entry: HistoryEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getHistory(limit = 50): Promise<HistoryEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("date");
    const request = index.openCursor(null, "prev"); // newest first
    const results: HistoryEntry[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value as HistoryEntry);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAnalysis(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearHistory(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
