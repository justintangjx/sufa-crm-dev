// In-memory mock store with localStorage persistence. Backs the offline mock API.
import { buildSeed, type MockData } from "./seed";

const DATA_KEY = "sufa-mock-data";
const USER_KEY = "sufa-mock-user";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

let memory: MockData | null = null;

export function getData(): MockData {
  if (memory) {
    return memory;
  }
  if (hasStorage()) {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (raw) {
      try {
        memory = JSON.parse(raw) as MockData;
        if (!memory.coachNoteSessions) {
          memory.coachNoteSessions = [];
        }
        if (!memory.coachNoteTurns) {
          memory.coachNoteTurns = [];
        }
        return memory;
      } catch {
        // fall through to a fresh seed on corrupt data
      }
    }
  }
  memory = buildSeed();
  saveData(memory);
  return memory;
}

export function saveData(data: MockData): void {
  memory = data;
  if (hasStorage()) {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }
}

export function resetData(): void {
  memory = buildSeed();
  if (hasStorage()) {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(memory));
    window.localStorage.removeItem(USER_KEY);
  }
}

export function getCurrentUserId(): string | null {
  if (hasStorage()) {
    return window.localStorage.getItem(USER_KEY);
  }
  return null;
}

export function setCurrentUserId(id: string | null): void {
  if (!hasStorage()) {
    return;
  }
  if (id) {
    window.localStorage.setItem(USER_KEY, id);
  } else {
    window.localStorage.removeItem(USER_KEY);
  }
}

export function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
