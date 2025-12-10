import { db, Match, Score } from './db';

// Action type definitions
export type Action =
  | { type: 'updateScore'; contestant: string; judge: string; value: number | null; number?: string }
  | { type: 'addContestant'; name: string; number?: string }
  | { type: 'removeContestant'; name: string; number?: string }
  | { type: 'updateContestantNumber'; contestant: string; number: string };

// Helper function to find contestant by number
// Returns the first matching contestant name, or null if not found
function findContestantByNumber(match: Match, number: string): string | null {
  if (!match.contestantNumbers) return null;
  const entry = Object.entries(match.contestantNumbers).find(([_, n]) => n === number);
  return entry ? entry[0] : null;
}

// Helper function to find all contestants by number (in case of duplicates)
function findAllContestantsByNumber(match: Match, number: string): string[] {
  if (!match.contestantNumbers) return [];
  return Object.entries(match.contestantNumbers)
    .filter(([_, n]) => n === number)
    .map(([name, _]) => name);
}

// Apply a single action to the database
async function applyAction(matchId: number, action: Action): Promise<void> {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new Error(`Match with id ${matchId} not found`);
  }

  const now = Date.now();

  switch (action.type) {
    case 'updateScore': {
      // Find the actual contestant - try by number first, then by name
      const normalizeName = (name: string): string => name.trim().toLowerCase();
      const normalizedJudgeName = normalizeName(action.judge);
      const actualJudgeName = match.judges.find(j => normalizeName(j) === normalizedJudgeName) || action.judge;
      
      let actualContestantName: string;
      if (action.number) {
        // Try to find by number first
        const foundByName = findContestantByNumber(match, action.number);
        if (foundByName) {
          actualContestantName = foundByName;
        } else {
          // Number not found, try by name
          const normalizedContestantName = normalizeName(action.contestant);
          actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedContestantName) || action.contestant;
        }
      } else {
        // No number provided, match by name
        const normalizedContestantName = normalizeName(action.contestant);
        actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedContestantName) || action.contestant;
      }

      // Find existing score or create new one
      // Smart merge: only update if existing value is null, or explicitly overwrite
      const existingScore = await db.scores
        .where('[matchId+contestant+judge]')
        .equals([matchId, actualContestantName, actualJudgeName])
        .first();

      if (existingScore) {
        // Only update if existing value is null, or if new value is explicitly provided
        // This allows merging without overwriting existing scores
        if (existingScore.value === null || action.value !== null) {
          await db.scores.update(existingScore.id!, {
            value: action.value,
            updatedAt: now,
          });
        }
      } else {
        await db.scores.add({
          matchId,
          contestant: actualContestantName,
          judge: actualJudgeName,
          value: action.value,
          updatedAt: now,
        });
      }

      // Update match's updatedAt timestamp
      await db.matches.update(matchId, { updatedAt: now });

      // Record in history (use actual names)
      await db.history.add({
        matchId,
        action: 'updateScore',
        data: { ...action, contestant: actualContestantName, judge: actualJudgeName },
        timestamp: now,
      });
      break;
    }

    case 'addContestant': {
      // Case-insensitive check for duplicates by name
      const normalizeName = (name: string): string => name.trim().toLowerCase();
      const normalizedActionName = normalizeName(action.name);
      const existingContestant = match.contestants.find(c => normalizeName(c) === normalizedActionName);
      
      if (!existingContestant) {
        const updatedContestants = [...match.contestants, action.name];
        const updatedNumbers = { ...(match.contestantNumbers || {}) };
        
        // If number is provided, set it
        if (action.number) {
          updatedNumbers[action.name] = action.number;
        }
        
        await db.matches.update(matchId, {
          contestants: updatedContestants,
          contestantNumbers: updatedNumbers,
          updatedAt: now,
        });

        // Record in history
        await db.history.add({
          matchId,
          action: 'addContestant',
          data: action,
          timestamp: now,
        });
      }
      break;
    }

    case 'removeContestant': {
      const updatedContestants = match.contestants.filter(c => c !== action.name);
      await db.matches.update(matchId, {
        contestants: updatedContestants,
        updatedAt: now,
      });

      // Remove all scores for this contestant
      const scoresToDelete = await db.scores
        .where('matchId')
        .equals(matchId)
        .filter(score => score.contestant === action.name)
        .toArray();
      await Promise.all(scoresToDelete.map(score => db.scores.delete(score.id!)));

      // Update contestantNumbers if exists
      if (match.contestantNumbers && match.contestantNumbers[action.name]) {
        const updatedNumbers = { ...match.contestantNumbers };
        delete updatedNumbers[action.name];
        await db.matches.update(matchId, {
          contestantNumbers: updatedNumbers,
        });
      }

      // Record in history
      await db.history.add({
        matchId,
        action: 'removeContestant',
        data: action,
        timestamp: now,
      });
      break;
    }

    case 'updateContestantNumber': {
      // Find the actual contestant - try by number first, then by name
      let actualContestantName: string;
      
      // First try to find by the provided number (if it exists, update that contestant)
      const existingByNumber = findContestantByNumber(match, action.number);
      if (existingByNumber) {
        // If number already exists, update that contestant's number
        actualContestantName = existingByNumber;
      } else {
        // Number doesn't exist, find by contestant name
        const normalizeName = (name: string): string => name.trim().toLowerCase();
        const normalizedActionName = normalizeName(action.contestant);
        actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedActionName) || action.contestant;
      }
      
      // Update or add contestant number (numbers can repeat, so this is fine)
      const updatedNumbers = { ...(match.contestantNumbers || {}) };
      updatedNumbers[actualContestantName] = action.number;
      
      await db.matches.update(matchId, {
        contestantNumbers: updatedNumbers,
        updatedAt: now,
      });

      // Record in history (use actual name)
      await db.history.add({
        matchId,
        action: 'updateContestantNumber',
        data: { ...action, contestant: actualContestantName },
        timestamp: now,
      });
      break;
    }

    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}

// Apply multiple actions in sequence with optimization for bulk operations
export async function applyActions(matchId: number, actions: Action[]): Promise<void> {
  if (actions.length === 0) return;

  // For bulk operations, cache the match data to avoid repeated database reads
  let cachedMatch: Match | undefined;
  const getMatch = async (): Promise<Match> => {
    if (!cachedMatch) {
      cachedMatch = await db.matches.get(matchId);
      if (!cachedMatch) {
        throw new Error(`Match with id ${matchId} not found`);
      }
    }
    return cachedMatch;
  };

  // Helper to normalize names for case-insensitive comparison
  const normalizeName = (name: string): string => name.trim().toLowerCase();
  
  // Track processed contestants to avoid duplicates in bulk operations
  const processedContestants = new Set<string>();

  for (const action of actions) {
    const match = await getMatch();
    
    // Update cache for addContestant to avoid stale data
    if (action.type === 'addContestant') {
      const normalizedName = normalizeName(action.name);
      if (!processedContestants.has(normalizedName)) {
        const existingName = match.contestants.find(c => normalizeName(c) === normalizedName);
        if (!existingName) {
          const updatedContestants = [...match.contestants, action.name];
          const updatedNumbers = { ...(match.contestantNumbers || {}) };
          
          // If number is provided, set it
          if (action.number) {
            updatedNumbers[action.name] = action.number;
          }
          
          await db.matches.update(matchId, {
            contestants: updatedContestants,
            contestantNumbers: updatedNumbers,
            updatedAt: Date.now(),
          });
          // Update cache
          cachedMatch = { ...match, contestants: updatedContestants, contestantNumbers: updatedNumbers };
          processedContestants.add(normalizedName);
          
          await db.history.add({
            matchId,
            action: 'addContestant',
            data: action,
            timestamp: Date.now(),
          });
        }
      }
      continue;
    }

    // For updateContestantNumber, use cached match and update cache
    if (action.type === 'updateContestantNumber') {
      const match = await getMatch();
      
      // Try to find by number first, then by name
      let actualContestantName: string;
      const existingByNumber = findContestantByNumber(match, action.number);
      if (existingByNumber) {
        actualContestantName = existingByNumber;
      } else {
        const normalizedContestantName = normalizeName(action.contestant);
        actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedContestantName) || action.contestant;
      }
      
      const updatedNumbers = { ...(match.contestantNumbers || {}) };
      updatedNumbers[actualContestantName] = action.number;
      
      await db.matches.update(matchId, {
        contestantNumbers: updatedNumbers,
        updatedAt: Date.now(),
      });
      // Update cache
      cachedMatch = { ...match, contestantNumbers: updatedNumbers };
      
      await db.history.add({
        matchId,
        action: 'updateContestantNumber',
        data: { ...action, contestant: actualContestantName },
        timestamp: Date.now(),
      });
      continue;
    }

    // For other actions (updateScore, removeContestant), use standard applyAction
    // These operations are less frequent in bulk scenarios, so using applyAction is acceptable
    await applyAction(matchId, action);
  }
}

