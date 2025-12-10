import type { NextApiRequest, NextApiResponse } from 'next';
import { Action } from '@/lib/actions';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ actions: Action[] } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, matchData } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text input is required' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'DeepSeek API key is not configured' });
  }

  // Prepare comprehensive match data for AI
  const judges = matchData?.judges || [];
  const contestants = matchData?.contestants || [];
  const contestantNumbers = matchData?.match?.contestantNumbers || {};
  const scores = matchData?.scores || [];

  // Build a map: number -> contestant name(s) (numbers can repeat)
  const numberToContestants: Record<string, string[]> = {};
  const allNumbers = new Set<string>();
  
  Object.entries(contestantNumbers).forEach(([name, number]) => {
    const numStr = String(number || '');
    if (numStr) {
      allNumbers.add(numStr);
      if (!numberToContestants[numStr]) {
        numberToContestants[numStr] = [];
      }
      numberToContestants[numStr].push(name);
    }
  });

  // Build scores by number for easier lookup
  const scoresByNumber: Record<string, Array<{ judge: string; value: number | null }>> = {};
  scores.forEach((s: any) => {
    const contestantName = s.contestant;
    const number = contestantNumbers[contestantName];
    if (number) {
      const numStr = String(number);
      if (!scoresByNumber[numStr]) {
        scoresByNumber[numStr] = [];
      }
      scoresByNumber[numStr].push({
        judge: s.judge,
        value: s.value,
      });
    }
  });

  // Build a comprehensive data structure for AI to understand current state
  const currentState = {
    judges,
    existingNumbers: Array.from(allNumbers).sort((a, b) => {
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.localeCompare(b);
    }),
    numberToContestants,
    scoresByNumber,
  };

  try {
    // Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `You are an intelligent assistant that generates JSON actions for a competition scoring system.

CRITICAL RULES:
1. **Only Use Numbers (海选号)**: The system ONLY uses 海选号 (numbers) to identify contestants. NO names are used in user input.
2. **Smart Detection**: Check if a number exists in existingNumbers. If exists → UPDATE, if not → ADD.
3. **Name Auto-generation**: When adding, auto-generate unique name as "选手-{number}" or "选手-{number}-{counter}" if number already exists.
4. **Number Range Support**: 
   - "增加10个选手" → Add numbers 1-10 (or continue from existing max)
   - "增加20-50号选手" → Add numbers 20, 21, 22, ..., 50
   - "增加20到50号选手" → Same as above
5. **Score Operations**:
   - "海选号 裁判 分数" → Update score for that number and judge
   - "海选号 所有老师 分数" → Update scores for that number and ALL judges
   - Can update multiple contestants at once
6. **Bulk Operations**: Support adding/updating multiple contestants in one request.

Available actions:
- updateScore: { type: "updateScore", contestant: string, judge: string, value: number, number: string }
  * contestant: Auto-generated name (you don't need to provide, system will find by number)
  * number: REQUIRED - the 海选号
  * judge: Judge name (must match exactly from judges list)
  * value: Score value (0-100)
- addContestant: { type: "addContestant", name: string, number: string }
  * name: Auto-generated as "选手-{number}" (or "选手-{number}-{counter}" if duplicate)
  * number: REQUIRED - the 海选号
- updateContestantNumber: { type: "updateContestantNumber", contestant: string, number: string }
  * Usually not needed when adding new contestants (number is set in addContestant)

Current match state:
Judges: ${judges.join(', ') || 'None'}
Existing 海选号: ${currentState.existingNumbers.join(', ') || 'None'}
Number to Contestants mapping:
${JSON.stringify(currentState.numberToContestants, null, 2)}
Scores by number:
${JSON.stringify(currentState.scoresByNumber, null, 2)}

Input patterns you should recognize:
1. **Add contestants by count**: "增加10个选手" or "再帮我增加10个选手"
   → Find max existing number, add from max+1 to max+10
   → Example: If max is 20, add 21-30

2. **Add contestants by range**: "增加20-50号选手" or "增加20到50号选手"
   → Add all numbers from 20 to 50 (only if they don't exist)
   → For each: addContestant with number

3. **Add contestant with score**: "001 Judge A 8.8" or "1 Judge A 8.8"
   → If 001 exists: updateScore
   → If 001 doesn't exist: addContestant + updateScore

4. **Update single score**: "001 Judge A 8.8"
   → Find contestant by number 001, updateScore

5. **Update all scores for a number**: "001 所有老师 8.5" or "1 所有裁判 8.5"
   → Find contestant by number 001, updateScore for ALL judges

6. **Bulk add with scores**: Multiple lines of "海选号 裁判 分数"
   → Process each line, add if needed, update scores

IMPORTANT: 
- ALWAYS check existingNumbers to determine if number exists
- If number exists → use UPDATE operations (find first contestant with that number)
- If number doesn't exist → use ADD operations
- For "增加X个选手", calculate starting number from max existing + 1
- For "增加X-Y号选手", add all numbers from X to Y that don't exist
- When updating scores, you can update multiple contestants at once
- Always include 'number' field in all actions
- ⚠️ CRITICAL: Judge names MUST match EXACTLY from the judges list provided above
  * If input has "Judge A" but judges list has "Judge A", use "Judge A"
  * If input has "张老师" but judges list has "张老师", use "张老师"
  * If input has similar but not exact match, find the closest match from judges list
  * NEVER use judge names that are not in the judges list
  * If judge name doesn't match, try to find the closest match (case-insensitive, ignore spaces)

Return only a valid JSON array of actions. Example:
[{"type":"addContestant","name":"选手-21","number":"21"},{"type":"addContestant","name":"选手-22","number":"22"},{"type":"updateScore","contestant":"选手-1","judge":"Judge A","value":8.8,"number":"1"}]`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API error:', response.status, errorData);
      return res.status(response.status).json({ 
        error: `DeepSeek API error: ${response.statusText}` 
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'Invalid response from DeepSeek API' });
    }

    // Parse the JSON response
    let actions: Action[];
    try {
      // Try to parse as JSON
      actions = JSON.parse(content);
      
      // Ensure it's an array
      if (!Array.isArray(actions)) {
        actions = [actions];
      }
    } catch (parseError) {
      // If parsing fails, fall back to mock implementation
      console.warn('Failed to parse AI response, using fallback:', parseError);
      actions = await fallbackParse(text, matchData);
    }

    return res.status(200).json({ actions });
  } catch (error: any) {
    console.error('Error calling DeepSeek API:', error);
    
    // Fallback to mock implementation on error
    try {
      const actions = await fallbackParse(text, matchData);
      return res.status(200).json({ actions });
    } catch (fallbackError) {
      return res.status(500).json({ 
        error: error.message || 'Failed to generate actions' 
      });
    }
  }
}

// Fallback parsing function with smart detection
async function fallbackParse(text: string, matchData: any): Promise<Action[]> {
  const actions: Action[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const contestants = matchData?.contestants || [];
  const contestantNumbers = matchData?.match?.contestantNumbers || {};
  const judges = matchData?.judges || [];

  // Build set of existing numbers
  const existingNumbers = new Set<string>();
  Object.values(contestantNumbers).forEach(num => {
    if (num) existingNumbers.add(String(num));
  });

  // Helper function to find contestant by number (returns first match)
  const findContestantByNumber = (number: string): string | null => {
    const numStr = String(number).trim();
    const entry = Object.entries(contestantNumbers).find(([_, n]) => String(n) === numStr);
    return entry ? entry[0] : null;
  };

  // Helper function to generate unique name from number
  const generateName = (number: string): string => {
    let name = `选手-${number}`;
    let counter = 1;
    while (contestants.includes(name)) {
      name = `选手-${number}-${counter}`;
      counter++;
    }
    return name;
  };

  // Helper function to find exact or closest match for judge name
  const findJudgeName = (inputJudge: string): string | null => {
    const normalizedInput = inputJudge.trim().toLowerCase().replace(/\s+/g, '');
    
    // First try exact match (case-insensitive)
    const exactMatch = judges.find((j: string) => j.toLowerCase().trim() === inputJudge.toLowerCase().trim());
    if (exactMatch) return exactMatch;
    
    // Try match ignoring spaces
    const noSpaceMatch = judges.find((j: string) => 
      j.toLowerCase().replace(/\s+/g, '') === normalizedInput
    );
    if (noSpaceMatch) return noSpaceMatch;
    
    // Try partial match (contains)
    const partialMatch = judges.find((j: string) => 
      j.toLowerCase().includes(normalizedInput) || normalizedInput.includes(j.toLowerCase())
    );
    if (partialMatch) return partialMatch;
    
    return null;
  };

  // Check for bulk add patterns first
  const bulkAddMatch = text.match(/(?:增加|添加)(\d+)(?:个|位)?选手/);
  if (bulkAddMatch) {
    const count = parseInt(bulkAddMatch[1], 10);
    if (!isNaN(count) && count > 0) {
      // Find max existing number
      let maxNum = 0;
      existingNumbers.forEach(num => {
        const numVal = parseInt(num, 10);
        if (!isNaN(numVal) && numVal > maxNum) {
          maxNum = numVal;
        }
      });
      
      // Add from maxNum+1 to maxNum+count
      for (let i = 1; i <= count; i++) {
        const number = String(maxNum + i);
        if (!existingNumbers.has(number)) {
          const name = generateName(number);
          actions.push({
            type: 'addContestant',
            name,
            number,
          });
        }
      }
      return actions;
    }
  }

  // Check for range add pattern: "增加20-50号选手" or "增加20到50号选手"
  const rangeAddMatch = text.match(/(?:增加|添加)(\d+)[-到](\d+)(?:号)?选手/);
  if (rangeAddMatch) {
    const start = parseInt(rangeAddMatch[1], 10);
    const end = parseInt(rangeAddMatch[2], 10);
    if (!isNaN(start) && !isNaN(end) && start <= end) {
      for (let i = start; i <= end; i++) {
        const number = String(i);
        if (!existingNumbers.has(number)) {
          const name = generateName(number);
          actions.push({
            type: 'addContestant',
            name,
            number,
          });
        }
      }
      return actions;
    }
  }

  for (const line of lines) {
    // Pattern: "海选号 裁判 分数" or "001 Judge A 8.8" or "1 Judge A 8.8"
    const numberScoreMatch = line.match(/^(\d+)\s+(.+?)\s+([\d.]+)$/);
    if (numberScoreMatch) {
      const [, number, judgeInput, value] = numberScoreMatch;
      const numStr = number.trim();
      
      // Find exact or closest judge name match
      const matchedJudge = findJudgeName(judgeInput.trim());
      if (!matchedJudge) {
        // Skip if judge name doesn't match any in the list
        continue;
      }
      
      const existingName = findContestantByNumber(numStr);
      
      if (existingName) {
        // Update existing
        actions.push({
          type: 'updateScore',
          contestant: existingName,
          judge: matchedJudge,
          value: parseFloat(value),
          number: numStr,
        });
      } else {
        // Add new
        const name = generateName(numStr);
        actions.push({
          type: 'addContestant',
          name,
          number: numStr,
        });
        actions.push({
          type: 'updateScore',
          contestant: name,
          judge: matchedJudge,
          value: parseFloat(value),
          number: numStr,
        });
      }
      continue;
    }

    // Pattern: "海选号 所有老师/所有裁判 分数" -> update all judges
    const allJudgesMatch = line.match(/^(\d+)\s+(?:所有老师|所有裁判)\s+([\d.]+)$/);
    if (allJudgesMatch) {
      const [, number, value] = allJudgesMatch;
      const numStr = number.trim();
      const existingName = findContestantByNumber(numStr);
      const scoreValue = parseFloat(value);
      
      if (existingName) {
        // Update all judges for existing contestant
        judges.forEach((judge: string) => {
          actions.push({
            type: 'updateScore',
            contestant: existingName,
            judge,
            value: scoreValue,
            number: numStr,
          });
        });
      } else {
        // Add new and update all judges
        const name = generateName(numStr);
        actions.push({
          type: 'addContestant',
          name,
          number: numStr,
        });
        judges.forEach((judge: string) => {
          actions.push({
            type: 'updateScore',
            contestant: name,
            judge,
            value: scoreValue,
            number: numStr,
          });
        });
      }
      continue;
    }

    // Pattern: Just a number -> add contestant
    const justNumberMatch = line.match(/^(\d+)$/);
    if (justNumberMatch) {
      const number = justNumberMatch[1];
      if (!existingNumbers.has(number)) {
        const name = generateName(number);
        actions.push({
          type: 'addContestant',
          name,
          number,
        });
      }
      continue;
    }
  }

  return actions;
}

