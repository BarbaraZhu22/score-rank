// utils/actions.js - Action handler for WeChat Mini Program

const { db } = require('./db');

// Action type definitions
// Action = 
//   | { type: 'updateScore'; contestant: string; judge: string; value: number | null; number?: string }
//   | { type: 'addContestant'; name: string; number?: string }
//   | { type: 'removeContestant'; name: string; number?: string }
//   | { type: 'updateContestantNumber'; contestant: string; number: string }

// Helper function to find contestant by number
function findContestantByNumber(match, number) {
  if (!match.contestantNumbers) return null;
  const entry = Object.entries(match.contestantNumbers).find(([_, n]) => n === number);
  return entry ? entry[0] : null;
}

// Apply a single action to the database
async function applyAction(matchId, action, currentVersion = null) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new Error(`Match with id ${matchId} not found`);
  }

  const now = Date.now();
  const scores = [...(match.scores || [])];

  switch (action.type) {
    case 'updateScore': {
      const normalizeName = (name) => name.trim().toLowerCase();
      const normalizedJudgeName = normalizeName(action.judge);
      const actualJudgeName = match.judges.find(j => normalizeName(j) === normalizedJudgeName) || action.judge;
      
      let actualContestantName;
      if (action.number) {
        const foundByName = findContestantByNumber(match, action.number);
        if (foundByName) {
          actualContestantName = foundByName;
        } else {
          const normalizedContestantName = normalizeName(action.contestant);
          actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedContestantName) || action.contestant;
        }
      } else {
        const normalizedContestantName = normalizeName(action.contestant);
        actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedContestantName) || action.contestant;
      }

      // Find existing score in match.scores array
      const scoreIndex = scores.findIndex(
        s => s.contestant === actualContestantName && s.judge === actualJudgeName
      );

      if (scoreIndex !== -1) {
        // Update existing score
        scores[scoreIndex] = {
          contestant: actualContestantName,
          judge: actualJudgeName,
          value: action.value,
          updatedAt: now,
        };
      } else {
        // Add new score
        scores.push({
          contestant: actualContestantName,
          judge: actualJudgeName,
          value: action.value,
          updatedAt: now,
        });
      }

      // Update match with new scores and version
      const updateResult = await db.matches.update(match.id, { scores }, currentVersion);
      if (!updateResult.success) {
        if (updateResult.error === 'VERSION_CONFLICT') {
          throw new Error('VERSION_CONFLICT');
        }
        throw new Error(updateResult.error || 'Update failed');
      }
      break;
    }

    case 'addContestant': {
      const normalizeName = (name) => name.trim().toLowerCase();
      const normalizedActionName = normalizeName(action.name);
      const existingContestant = match.contestants.find(c => normalizeName(c) === normalizedActionName);
      
      if (!existingContestant) {
        const updatedContestants = [...match.contestants, action.name];
        const updatedNumbers = { ...(match.contestantNumbers || {}) };
        
        if (action.number) {
          updatedNumbers[action.name] = action.number;
        }
        
        const updateResult = await db.matches.update(match.id, {
          contestants: updatedContestants,
          contestantNumbers: updatedNumbers,
        }, currentVersion);
        
        if (!updateResult.success) {
          if (updateResult.error === 'VERSION_CONFLICT') {
            throw new Error('VERSION_CONFLICT');
          }
          throw new Error(updateResult.error || 'Update failed');
        }
      }
      break;
    }

    case 'removeContestant': {
      const updatedContestants = match.contestants.filter(c => c !== action.name);
      
      // Remove scores for this contestant
      const updatedScores = scores.filter(
        s => s.contestant !== action.name
      );
      
      const updateResult = await db.matches.update(match.id, {
        contestants: updatedContestants,
        scores: updatedScores,
      }, currentVersion);
      
      if (!updateResult.success) {
        if (updateResult.error === 'VERSION_CONFLICT') {
          throw new Error('VERSION_CONFLICT');
        }
        throw new Error(updateResult.error || 'Update failed');
      }
      break;
    }

    case 'updateContestantNumber': {
      let actualContestantName;
      
      const existingByNumber = findContestantByNumber(match, action.number);
      if (existingByNumber) {
        actualContestantName = existingByNumber;
      } else {
        const normalizeName = (name) => name.trim().toLowerCase();
        const normalizedActionName = normalizeName(action.contestant);
        actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedActionName) || action.contestant;
      }
      
      const updatedNumbers = { ...(match.contestantNumbers || {}) };
      updatedNumbers[actualContestantName] = action.number;
      
      const updateResult = await db.matches.update(match.id, {
        contestantNumbers: updatedNumbers,
      }, currentVersion);
      
      if (!updateResult.success) {
        if (updateResult.error === 'VERSION_CONFLICT') {
          throw new Error('VERSION_CONFLICT');
        }
        throw new Error(updateResult.error || 'Update failed');
      }
      break;
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// Apply multiple actions in sequence
async function applyActions(matchId, actions, currentVersion = null) {
  if (actions.length === 0) return;

  // Get match once to get current version and scores
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new Error(`Match with id ${matchId} not found`);
  }
  
  // Use provided version or match version
  const versionToUse = currentVersion !== null ? currentVersion : match.version;
  let scores = [...(match.scores || [])];

  const normalizeName = (name) => name.trim().toLowerCase();
  const processedContestants = new Set();

  for (const action of actions) {
    if (action.type === 'addContestant') {
      const normalizedName = normalizeName(action.name);
      if (!processedContestants.has(normalizedName)) {
        const existingName = match.contestants.find(c => normalizeName(c) === normalizedName);
        if (!existingName) {
          const updatedContestants = [...match.contestants, action.name];
          const updatedNumbers = { ...(match.contestantNumbers || {}) };
          
          if (action.number) {
            updatedNumbers[action.name] = action.number;
          }
          
          const updateResult = await db.matches.update(match.id, {
            contestants: updatedContestants,
            contestantNumbers: updatedNumbers,
          }, versionToUse);
          
          if (!updateResult.success) {
            if (updateResult.error === 'VERSION_CONFLICT') {
              throw new Error('VERSION_CONFLICT');
            }
            throw new Error(updateResult.error || 'Update failed');
          }
          
          match.contestants = updatedContestants;
          match.contestantNumbers = updatedNumbers;
          processedContestants.add(normalizedName);
        }
      }
      continue;
    }

    if (action.type === 'updateContestantNumber') {
      let actualContestantName;
      const existingByNumber = findContestantByNumber(match, action.number);
      if (existingByNumber) {
        actualContestantName = existingByNumber;
      } else {
        const normalizedContestantName = normalizeName(action.contestant);
        actualContestantName = match.contestants.find(c => normalizeName(c) === normalizedContestantName) || action.contestant;
      }
      
      const updatedNumbers = { ...(match.contestantNumbers || {}) };
      updatedNumbers[actualContestantName] = action.number;
      
      const updateResult = await db.matches.update(match.id, {
        contestantNumbers: updatedNumbers,
      }, versionToUse);
      
      if (!updateResult.success) {
        if (updateResult.error === 'VERSION_CONFLICT') {
          throw new Error('VERSION_CONFLICT');
        }
        throw new Error(updateResult.error || 'Update failed');
      }
      
      match.contestantNumbers = updatedNumbers;
      continue;
    }

    // For other actions (updateScore, removeContestant), use standard applyAction
    await applyAction(match.id, action, versionToUse);
  }
}

module.exports = {
  applyActions,
  applyAction
};
