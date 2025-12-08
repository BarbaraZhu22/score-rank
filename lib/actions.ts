import { db, Match, Score } from './db';

// Action type definitions
export type Action =
  | { type: 'updateScore'; contestant: string; judge: string; value: number | null }
  | { type: 'addContestant'; name: string }
  | { type: 'removeContestant'; name: string }
  | { type: 'addJudge'; name: string }
  | { type: 'recalc' };

// Apply a single action to the database
async function applyAction(matchId: number, action: Action): Promise<void> {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new Error(`Match with id ${matchId} not found`);
  }

  const now = Date.now();

  switch (action.type) {
    case 'updateScore': {
      // Find existing score or create new one
      const existingScore = await db.scores
        .where('[matchId+contestant+judge]')
        .equals([matchId, action.contestant, action.judge])
        .first();

      if (existingScore) {
        await db.scores.update(existingScore.id!, {
          value: action.value,
          updatedAt: now,
        });
      } else {
        await db.scores.add({
          matchId,
          contestant: action.contestant,
          judge: action.judge,
          value: action.value,
          updatedAt: now,
        });
      }

      // Update match's updatedAt timestamp
      await db.matches.update(matchId, { updatedAt: now });

      // Record in history
      await db.history.add({
        matchId,
        action: 'updateScore',
        data: action,
        timestamp: now,
      });
      break;
    }

    case 'addContestant': {
      if (!match.contestants.includes(action.name)) {
        const updatedContestants = [...match.contestants, action.name];
        await db.matches.update(matchId, {
          contestants: updatedContestants,
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

    case 'addJudge': {
      if (!match.judges.includes(action.name)) {
        const updatedJudges = [...match.judges, action.name];
        await db.matches.update(matchId, {
          judges: updatedJudges,
          updatedAt: now,
        });

        // Record in history
        await db.history.add({
          matchId,
          action: 'addJudge',
          data: action,
          timestamp: now,
        });
      }
      break;
    }

    case 'recalc': {
      // Recalculate totals - this would typically be done on the fly when displaying
      // But we can update the match timestamp to indicate a recalculation occurred
      await db.matches.update(matchId, { updatedAt: now });

      // Record in history
      await db.history.add({
        matchId,
        action: 'recalc',
        data: action,
        timestamp: now,
      });
      break;
    }

    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}

// Apply multiple actions in sequence
export async function applyActions(matchId: number, actions: Action[]): Promise<void> {
  for (const action of actions) {
    await applyAction(matchId, action);
  }
}

