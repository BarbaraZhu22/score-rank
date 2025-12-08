import { Action } from './actions';

/**
 * Generate actions from text input using AI
 * Calls the API route which handles DeepSeek API integration securely on the server
 */
export async function generateActions(text: string, matchData: any): Promise<Action[]> {
  try {
    const response = await fetch('/api/ai/generate-actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        matchData,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate actions');
    }

    const data = await response.json();
    return data.actions || [];
  } catch (error: any) {
    console.error('Error generating actions:', error);
    throw error;
  }
}

