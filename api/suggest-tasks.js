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

    const taskSummary = currentTasks.map(t => {
        let typeLabel = t.type;
        if (t.type === 'custom' && t.pattern) {
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            typeLabel = t.pattern.split(',').map(d => dayNames[parseInt(d)]).join(', ');
        }
        return `- ${t.name} (${t.category}, ${typeLabel})`;
    }).join('\n');

    const categoryList = (categories || [
        'general', 'health', 'learning', 'creative', 'wellness', 'productivity', 'social'
    ]).join(', ');

    const systemPrompt = `You are a personal productivity assistant for a gamified task manager app.
The user earns 10 XP per completed task. Suggest tasks that are:
- Actionable and specific (not vague like "be productive")
- Complementary to their existing habits (fill gaps in their routine)
- Varied across different categories
- Achievable in a single session (not multi-day projects)

Available categories: ${categoryList}
Available task types: onetime, daily
Today's date: ${todayDate || new Date().toISOString().split('T')[0]}

Respond with a JSON array of exactly 3 task suggestions. Each object must have:
- "name": string (the task description, concise, imperative form)
- "category": string (one of the available categories)
- "type": string (one of: onetime, daily)
- "reason": string (one short sentence explaining why this task is suggested)

Return ONLY the JSON array, no other text.`;

    const userMessage = currentTasks.length > 0
        ? `Here are my current tasks:\n${taskSummary}\n\nSuggest 3 new tasks that would complement my routine.`
        : 'I have no tasks yet. Suggest 3 starter tasks to help me build good habits.';

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

        const validCategories = new Set(categories || [
            'general', 'health', 'learning', 'creative', 'wellness', 'productivity', 'social'
        ]);
        const validTypes = new Set(['onetime', 'daily']);

        suggestions = suggestions.slice(0, 5).map(s => ({
            name: String(s.name || '').slice(0, 100),
            category: validCategories.has(s.category) ? s.category : 'general',
            type: validTypes.has(s.type) ? s.type : 'onetime',
            reason: String(s.reason || '').slice(0, 150)
        }));

        return res.status(200).json({ suggestions });
    } catch (err) {
        console.error('suggest-tasks error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
