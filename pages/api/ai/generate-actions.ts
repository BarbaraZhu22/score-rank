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

  // Build a comprehensive data structure for AI to understand current state
  const currentState = {
    judges,
    contestants: contestants.map((name: string) => ({
      name,
      number: contestantNumbers[name] || null,
    })),
    scores: scores.map((s: any) => ({
      contestant: s.contestant,
      judge: s.judge,
      value: s.value,
    })),
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
1. **Smart Detection**: Carefully examine the input data and existing data to determine if it's ADDING new data or EDITING existing data.
2. **Name Matching**: Match contestants by name (case-insensitive, ignore spaces). If a name exists in current contestants, it's an EDIT, otherwise it's ADD.
3. **Contestant Number (海选号)**: If input contains both name and number (序号), check if the name already exists:
   - If name exists but has no number → use updateContestantNumber
   - If name exists with different number → use updateContestantNumber (update)
   - If name doesn't exist → use addContestant + updateContestantNumber
4. **Score Merging**: When updating scores, ONLY update if the score doesn't exist or is null. Preserve existing non-null scores unless explicitly told to overwrite.
5. **Bulk Operations**: Support bulk operations like "给所有没有海选号的选手加海选号" or "给所有选手绑上某个老师的评分"

Available actions:
- updateScore: { type: "updateScore", contestant: string, judge: string, value: number }
  * Use when setting/updating a score. Only update if score is missing or null (unless explicitly overwriting).
- addContestant: { type: "addContestant", name: string }
  * Use when adding a NEW contestant that doesn't exist in current contestants.
- updateContestantNumber: { type: "updateContestantNumber", contestant: string, number: string }
  * Use when setting or updating a contestant's audition number (海选号).

Current match state:
Judges: ${judges.join(', ') || 'None'}
Contestants with numbers:
${JSON.stringify(currentState.contestants, null, 2)}
Existing scores:
${JSON.stringify(currentState.scores, null, 2)}

Input patterns you should recognize:
- "序号+选手名" (e.g., "001 张三") → addContestant + updateContestantNumber
- "序号+选手名+分数" (e.g., "001 张三 Judge A 8.8") → addContestant + updateContestantNumber + updateScore
- "给所有没有海选号的选手加海选号" → Multiple updateContestantNumber actions
- "给所有选手绑上某个老师的评分" → Multiple updateScore actions for all contestants

IMPORTANT: 
- Compare input names with existing contestants (case-insensitive)
- If name exists → EDIT operations (updateContestantNumber, updateScore)
- If name doesn't exist → ADD operations (addContestant first, then updateContestantNumber/updateScore)
- When updating scores, preserve existing non-null values unless explicitly overwriting

Return only a valid JSON array of actions. Example:
[{"type":"addContestant","name":"张三"},{"type":"updateContestantNumber","contestant":"张三","number":"001"},{"type":"updateScore","contestant":"张三","judge":"Judge A","value":8.8}]`,
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

  // Helper function to check if contestant exists (case-insensitive)
  const findContestant = (name: string): string | null => {
    const normalizedName = name.trim().toLowerCase();
    return contestants.find((c: string) => c.toLowerCase() === normalizedName) || null;
  };

  for (const line of lines) {
    // Pattern: "序号 选手名" or "001 张三" -> addContestant + updateContestantNumber
    const numberNameMatch = line.match(/^(\d+|[A-Za-z]+\d+)\s+(.+)$/);
    if (numberNameMatch) {
      const [, number, name] = numberNameMatch;
      const existingName = findContestant(name);
      
      if (!existingName) {
        // New contestant
        actions.push({
          type: 'addContestant',
          name: name.trim(),
        });
      }
      
      // Update number (whether new or existing)
      actions.push({
        type: 'updateContestantNumber',
        contestant: existingName || name.trim(),
        number: number.trim(),
      });
      continue;
    }

    // Pattern: "序号 选手名 裁判 分数" or "001 张三 Judge A 8.8"
    const numberNameScoreMatch = line.match(/^(\d+|[A-Za-z]+\d+)\s+(.+?)\s+([^\s]+)\s+([\d.]+)$/);
    if (numberNameScoreMatch) {
      const [, number, name, judge, value] = numberNameScoreMatch;
      const existingName = findContestant(name);
      
      if (!existingName) {
        actions.push({
          type: 'addContestant',
          name: name.trim(),
        });
      }
      
      actions.push({
        type: 'updateContestantNumber',
        contestant: existingName || name.trim(),
        number: number.trim(),
      });
      
      actions.push({
        type: 'updateScore',
        contestant: existingName || name.trim(),
        judge: judge.trim(),
        value: parseFloat(value),
      });
      continue;
    }

    // Pattern: "选手名 裁判 分数" or "张三 Judge A 8.8" -> updateScore
    const scoreMatch = line.match(/^(.+?)\s+([^\s]+)\s+([\d.]+)$/);
    if (scoreMatch) {
      const [, contestant, judge, value] = scoreMatch;
      const existingName = findContestant(contestant);
      
      if (existingName) {
        actions.push({
          type: 'updateScore',
          contestant: existingName,
          judge: judge.trim(),
          value: parseFloat(value),
        });
      } else {
        // New contestant with score
        actions.push({
          type: 'addContestant',
          name: contestant.trim(),
        });
        actions.push({
          type: 'updateScore',
          contestant: contestant.trim(),
          judge: judge.trim(),
          value: parseFloat(value),
        });
      }
      continue;
    }

    // Pattern: "添加选手 王五" or "addContestant 王五"
    if (line.includes('添加选手') || line.toLowerCase().includes('addcontestant')) {
      const name = line.replace(/添加选手|addContestant/gi, '').trim();
      if (name && !findContestant(name)) {
        actions.push({
          type: 'addContestant',
          name,
        });
      }
      continue;
    }

    // Pattern: "给所有没有海选号的选手加海选号" or similar bulk operations
    if (line.includes('没有海选号') || line.includes('加海选号')) {
      // This is a complex operation, would need more context
      // For now, skip and let AI handle it
      continue;
    }
  }

  // If no actions found, try to parse more complex patterns
  if (actions.length === 0) {
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length - 2; i++) {
      const num = parseFloat(words[i + 2]);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        const existingName = findContestant(words[i]);
        if (existingName) {
          actions.push({
            type: 'updateScore',
            contestant: existingName,
            judge: words[i + 1],
            value: num,
          });
        } else {
          actions.push({
            type: 'addContestant',
            name: words[i],
          });
          actions.push({
            type: 'updateScore',
            contestant: words[i],
            judge: words[i + 1],
            value: num,
          });
        }
        i += 2;
      }
    }
  }

  return actions;
}

