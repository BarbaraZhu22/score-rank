import { Action } from './actions';

/**
 * Generate actions from text input using AI
 * This is a mock implementation. Replace with actual DeepSeek API call.
 */
export async function generateActions(text: string, matchData: any): Promise<Action[]> {
  // Mock implementation - parse simple text patterns
  // In production, replace this with actual DeepSeek API call
  
  const actions: Action[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    // Pattern: "张三 Judge A 8.8" -> updateScore
    const scoreMatch = line.match(/^(.+?)\s+([^\s]+)\s+([\d.]+)$/);
    if (scoreMatch) {
      const [, contestant, judge, value] = scoreMatch;
      actions.push({
        type: 'updateScore',
        contestant: contestant.trim(),
        judge: judge.trim(),
        value: parseFloat(value),
      });
      continue;
    }

    // Pattern: "添加选手 王五" or "addContestant 王五"
    if (line.includes('添加选手') || line.toLowerCase().includes('addcontestant')) {
      const name = line.replace(/添加选手|addContestant/gi, '').trim();
      if (name) {
        actions.push({
          type: 'addContestant',
          name,
        });
      }
      continue;
    }

    // Pattern: "添加裁判 Judge B" or "addJudge Judge B"
    if (line.includes('添加裁判') || line.toLowerCase().includes('addjudge')) {
      const name = line.replace(/添加裁判|addJudge/gi, '').trim();
      if (name) {
        actions.push({
          type: 'addJudge',
          name,
        });
      }
      continue;
    }
  }

  // If no actions found, try to parse more complex patterns
  if (actions.length === 0) {
    // Fallback: try to extract any numbers and names
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length - 2; i++) {
      const num = parseFloat(words[i + 2]);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        actions.push({
          type: 'updateScore',
          contestant: words[i],
          judge: words[i + 1],
          value: num,
        });
        i += 2;
      }
    }
  }

  // TODO: Replace with actual DeepSeek API call:
  /*
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are an assistant that generates JSON actions for a competition scoring system.
          Available actions:
          - updateScore: { type: "updateScore", contestant: string, judge: string, value: number }
          - addContestant: { type: "addContestant", name: string }
          - addJudge: { type: "addJudge", name: string }
          
          Current match data:
          Judges: ${matchData.judges.join(', ')}
          Contestants: ${matchData.contestants.join(', ')}
          
          Return only a JSON array of actions.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
    }),
  });

  const data = await response.json();
  const actions = JSON.parse(data.choices[0].message.content);
  return actions;
  */

  return actions;
}

