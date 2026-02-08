const PRIMARY_MODEL = 'claude-haiku-4-5-20251001';
const FALLBACK_MODEL = 'claude-sonnet-4-5-20250929';

async function callClaude(apiKey, model, systemPrompt, userMessage) {
    console.log('[API] Calling Claude with model:', model);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 200,
                temperature: 0.7,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            console.error('[API] Claude API timeout after 8s for model:', model);
        }
        throw err;
    }
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('[API] ANTHROPIC_API_KEY is not set');
        return res.status(500).json({ error: 'API key not configured', suggestions: [] });
    }

    console.log('[API] Key exists:', !!apiKey, '| Key prefix:', apiKey.slice(0, 7) + '...');

    const { currentTasks } = req.body;

    if (!currentTasks || !Array.isArray(currentTasks)) {
        return res.status(400).json({ error: 'currentTasks array is required', suggestions: [] });
    }

    // Cap at 15 tasks
    let sanitizedTasks = currentTasks.slice(0, 15);
    if (currentTasks.length > 15) {
        console.warn('[API] Too many tasks sent (' + currentTasks.length + '), truncating to 15');
    }

    // Truncate long task names
    sanitizedTasks = sanitizedTasks.map(t => {
        const name = String(t.name || '');
        return { name: name.length > 200 ? name.slice(0, 197) + '...' : name };
    });

    const taskSummary = sanitizedTasks.map(t => `- ${t.name}`).join('\n');

    const systemPrompt = `Generate 3-5 actionable task suggestions based on the user's existing tasks. Consider their current focus and suggest complementary next steps.

Return ONLY a valid JSON array with no markdown, no explanation:
[{"text":"task description","suggestedView":"Day/Week/Month","estimatedPoints":10-50,"category":"General/Health & Fitness/Learning/Creative/Wellness/Productivity/Social"}]

Category guide: exercise/nutrition→Health & Fitness, reading/courses→Learning, writing/design/music→Creative, meditation/journaling→Wellness, planning/organization→Productivity, calls/events→Social, other→General.

Be specific and practical.`;

    const userMessage = sanitizedTasks.length > 0
        ? `My tasks:\n${taskSummary}`
        : 'I have no tasks yet. Suggest starter habits.';

    const estimatedTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);

    console.log('[API] Tasks:', sanitizedTasks.length, '| Est. tokens:', estimatedTokens);

    if (estimatedTokens > 500) {
        console.error('[API] Request too large:', estimatedTokens, 'estimated tokens');
        return res.status(400).json({ error: 'Request too large, please reduce task count', suggestions: [] });
    }

    try {
        let response;
        try {
            response = await callClaude(apiKey, PRIMARY_MODEL, systemPrompt, userMessage);
        } catch (err) {
            if (err.name === 'AbortError') {
                console.warn('[API] Primary model timed out, trying fallback:', FALLBACK_MODEL);
                response = await callClaude(apiKey, FALLBACK_MODEL, systemPrompt, userMessage);
            } else {
                throw err;
            }
        }

        // Fallback to Sonnet if Haiku fails with 404 or model error
        if (!response.ok && (response.status === 404 || response.status === 400)) {
            const errorText = await response.text();
            console.warn('[API] Primary model failed (' + response.status + '):', errorText);
            console.warn('[API] Retrying with fallback model:', FALLBACK_MODEL);
            response = await callClaude(apiKey, FALLBACK_MODEL, systemPrompt, userMessage);
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorDetail;
            try { errorDetail = JSON.parse(errorText); } catch (_) { errorDetail = { raw: errorText }; }

            console.error('[API] Claude error:', response.status, JSON.stringify(errorDetail));

            const statusMessages = {
                401: 'API authentication failed',
                403: 'API authentication failed',
                404: 'AI model unavailable - check configuration',
                429: 'Rate limit exceeded - try again in a moment',
                529: 'AI service overloaded - try again in a moment'
            };

            const clientMessage = statusMessages[response.status]
                || errorDetail?.error?.message
                || 'AI service temporarily unavailable';

            return res.status(502).json({ error: clientMessage, suggestions: [] });
        }

        const data = await response.json();
        const content = data.content?.[0]?.text;

        if (!content) {
            console.error('[API] No text content in response:', JSON.stringify(data).slice(0, 300));
            return res.status(502).json({ error: 'Empty AI response', suggestions: [] });
        }

        console.log('[API] Raw AI response:', content.slice(0, 300));

        // Strip markdown code blocks if present
        const cleanContent = content
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();

        let suggestions;
        try {
            suggestions = JSON.parse(cleanContent);
        } catch (parseErr) {
            // Try to extract JSON array from response
            const match = cleanContent.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    suggestions = JSON.parse(match[0]);
                } catch (innerErr) {
                    console.error('[API] JSON extraction also failed:', innerErr.message);
                    console.error('[API] Cleaned content:', cleanContent.slice(0, 300));
                    return res.status(502).json({ error: 'Could not parse AI response', suggestions: [] });
                }
            } else {
                console.error('[API] No JSON array found in response:', cleanContent.slice(0, 300));
                return res.status(502).json({ error: 'Could not parse AI response', suggestions: [] });
            }
        }

        if (!Array.isArray(suggestions)) {
            console.error('[API] AI returned non-array:', typeof suggestions);
            return res.status(502).json({ error: 'Invalid suggestions format', suggestions: [] });
        }

        const validViews = new Set(['Day', 'Week', 'Month']);
        const categoryMap = {
            'general': 'general',
            'health & fitness': 'health',
            'health': 'health',
            'learning': 'learning',
            'personal development': 'learning',
            'creative': 'creative',
            'wellness': 'wellness',
            'productivity': 'productivity',
            'social': 'social',
            'finance': 'general',
            'household': 'general',
            'work': 'productivity',
            'other': 'general'
        };

        suggestions = suggestions
            .filter(s => s && s.text && String(s.text).trim().length > 0)
            .slice(0, 5)
            .map(s => {
                const rawCategory = String(s.category || '').toLowerCase().trim();
                const category = categoryMap[rawCategory];
                if (!category && rawCategory) {
                    console.warn('[API] Unknown category "' + s.category + '", defaulting to general');
                }
                return {
                    text: String(s.text || '').slice(0, 100),
                    suggestedView: validViews.has(s.suggestedView) ? s.suggestedView : 'Day',
                    estimatedPoints: Math.min(50, Math.max(10, parseInt(s.estimatedPoints) || 10)),
                    category: category || 'general'
                };
            });

        const usage = data.usage ? {
            input_tokens: data.usage.input_tokens || 0,
            output_tokens: data.usage.output_tokens || 0
        } : null;

        console.log('[API] Success:', suggestions.length, 'suggestions |', JSON.stringify(usage));
        return res.status(200).json({ suggestions, usage });
    } catch (err) {
        console.error('[API] Unexpected error:', err.name, err.message, err.stack);

        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'AI request timed out - try again', suggestions: [] });
        }

        return res.status(500).json({ error: 'Internal server error', suggestions: [] });
    }
}
