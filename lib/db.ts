import Dexie, { Table } from 'dexie';

// Database schema types
export interface Match {
  id?: number;
  name: string;
  judges: string[];
  contestants: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Score {
  id?: number;
  matchId: number;
  contestant: string;
  judge: string;
  value: number | null;
  updatedAt: number;
}

export interface History {
  id?: number;
  matchId: number;
  action: string;
  data: any;
  timestamp: number;
}

// Dexie database class
class CompetitionDatabase extends Dexie {
  matches!: Table<Match, number>;
  scores!: Table<Score, number>;
  history!: Table<History, number>;

  constructor() {
    super('CompetitionDB');
    
    this.version(1).stores({
      matches: '++id, name, createdAt, updatedAt',
      scores: '++id, matchId, contestant, judge, [matchId+contestant+judge], updatedAt',
      history: '++id, matchId, timestamp'
    });
  }
}

// Create database instance
export const db = new CompetitionDatabase();

// Helper function to create a new match
export async function createMatch(
  name: string,
  judges: string[] = [],
  contestants: string[] = []
): Promise<number> {
  const now = Date.now();
  const matchId = await db.matches.add({
    name,
    judges,
    contestants,
    createdAt: now,
    updatedAt: now,
  });
  return matchId as number;
}

// Helper function to get match data with related scores
export async function getMatchData(matchId: number) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new Error(`Match with id ${matchId} not found`);
  }

  const scores = await db.scores.where('matchId').equals(matchId).toArray();

  return {
    match,
    judges: match.judges,
    contestants: match.contestants,
    scores,
  };
}

