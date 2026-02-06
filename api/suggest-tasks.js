export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const { currentTasks, activeView, todayDate, categories } = req.body;

    if (!currentTasks || !Array.isArray(currentTasks)) {
        return res.status(400).json({ error: 'currentTasks array is required' });
    }

    const taskSummary = currentTasks.map(t => `- ${t.name}`).join('\n');

    const systemPrompt = `Generate 3-5 actionable task suggestions based on the user's existing tasks. Consider their current focus and suggest complementary next steps.

Return ONLY a valid JSON array with no markdown, no explanation:
[{"text":"task description","suggestedView":"Day/Week/Month","estimatedPoints":10-50}]

Be specific and practical.`;

    const userMessage = currentTasks.length > 0
        ? `My tasks:\n${taskSummary}`
        : 'I have no tasks yet. Suggest starter habits.';

    console.log('=== API Request Debug ===');
    console.log('System prompt length:', systemPrompt.length);
    console.log('User message length:', userMessage.length);
    console.log('Number of tasks sent:', currentTasks.length);
    console.log('Estimated input tokens:', Math.ceil((systemPrompt.length + userMessage.length) / 4));
    console.log('========================');

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 512,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Anthropic API error:', response.status, errorText);
            return res.status(502).json({ error: 'AI service temporarily unavailable' });
        }

        const data = await response.json();
        const content = data.content?.[0]?.text || '[]';

        let suggestions;
        try {
            suggestions = JSON.parse(content);
        } catch (parseErr) {
            const match = content.match(/\[[\s\S]*\]/);
            if (match) {
                suggestions = JSON.parse(match[0]);
            } else {
                return res.status(502).json({ error: 'Could not parse AI response' });
            }
        }

        const validViews = new Set(['Day', 'Week', 'Month']);

        suggestions = suggestions.slice(0, 5).map(s => ({
            text: String(s.text || '').slice(0, 100),
            suggestedView: validViews.has(s.suggestedView) ? s.suggestedView : 'Day',
            estimatedPoints: Math.min(50, Math.max(10, parseInt(s.estimatedPoints) || 10))
        }));

        return res.status(200).json({ suggestions });
    } catch (err) {
        console.error('suggest-tasks error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
