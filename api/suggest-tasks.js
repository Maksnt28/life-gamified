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

    const systemPrompt = `Generate 3-5 task suggestions as a valid JSON array.

CRITICAL: Return ONLY valid JSON with proper comma separation between objects.

Format (note the commas):
[{"text":"task 1","suggestedView":"Day","estimatedPoints":20,"category":"Productivity"},{"text":"task 2","suggestedView":"Week","estimatedPoints":30,"category":"Learning"}]

Categories: Health & Fitness, Wellness, Productivity, Learning, Creative, Social, General
Category guide: exercise/nutrition=Health & Fitness, reading/courses=Learning, writing/design/music=Creative, meditation/journaling=Wellness, planning/organization=Productivity, calls/events=Social, other=General.
Views: Day, Week, Month. Points: 10-50.

Return ONLY the JSON array. No markdown. No explanation. Be specific and practical.`;

    const userMessage = sanitizedTasks.length > 0
        ? `My tasks:\n${taskSummary}`
        : 'I have no tasks yet. Suggest starter habits.';

    const estimatedTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);

    console.log('[API] Tasks:', sanitizedTasks.length, '| Est. tokens:', estimatedTokens);

    if (estimatedTokens > 500) {
        console.error('[API] Request too large:', estimatedTokens, 'estimated tokens');
        return res.status(400).json({ error: 'Request too large, please reduce task count', suggestions: [] });
    }

    const reqId = Math.random().toString(36).substring(2, 8);
    console.log('[' + reqId + '] New AI suggestion request');

    try {
        let response;
        try {
            response = await callClaude(apiKey, PRIMARY_MODEL, systemPrompt, userMessage);
        } catch (err) {
            if (err.name === 'AbortError') {
                console.warn('[' + reqId + '] Primary model timed out, trying fallback:', FALLBACK_MODEL);
                response = await callClaude(apiKey, FALLBACK_MODEL, systemPrompt, userMessage);
            } else {
                throw err;
            }
        }

        // Fallback to Sonnet if Haiku fails with 404 or model error
        if (!response.ok && (response.status === 404 || response.status === 400)) {
            const errorText = await response.text();
            console.warn('[' + reqId + '] Primary model failed (' + response.status + '):', errorText);
            console.warn('[' + reqId + '] Retrying with fallback model:', FALLBACK_MODEL);
            response = await callClaude(apiKey, FALLBACK_MODEL, systemPrompt, userMessage);
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorDetail;
            try { errorDetail = JSON.parse(errorText); } catch (_) { errorDetail = { raw: errorText }; }

            console.error('[' + reqId + '] Claude error:', response.status, JSON.stringify(errorDetail));

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

        console.log('[' + reqId + '] Full response:', JSON.stringify(data).slice(0, 500));

        // Extract text from Claude's response structure
        let aiText;
        if (data.content && Array.isArray(data.content) && data.content[0]) {
            aiText = data.content[0].text;
        } else {
            console.error('[' + reqId + '] Unexpected response structure:', JSON.stringify(data).slice(0, 300));
            return res.status(500).json({ error: 'Invalid API response structure', suggestions: [] });
        }

        console.log('[' + reqId + '] Raw AI text (' + aiText.length + ' chars):', aiText);

        // Clean the text - remove markdown code blocks if present
        let cleanedText = aiText
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();

        console.log('[' + reqId + '] Cleaned text (' + cleanedText.length + ' chars):', cleanedText);

        // Auto-repair common JSON errors
        // Fix missing commas between objects: }{ or }\n{ → },\n{
        cleanedText = cleanedText.replace(/\}\s*\n\s*\{/g, '},\n{');
        cleanedText = cleanedText.replace(/\}\s*\{/g, '},{');
        // Fix trailing commas before closing bracket: ,] → ]
        cleanedText = cleanedText.replace(/,\s*\]/g, ']');

        console.log('[' + reqId + '] Auto-repaired JSON:', cleanedText);

        // Parse JSON
        let suggestions;
        try {
            suggestions = JSON.parse(cleanedText);
            console.log('[' + reqId + '] Successfully parsed JSON');
        } catch (parseError) {
            console.error('[' + reqId + '] JSON parse failed:', parseError.message);
            const errorPos = parseInt((parseError.message.match(/position (\d+)/) || [])[1] || '0');
            const contextStart = Math.max(0, errorPos - 100);
            const contextEnd = Math.min(cleanedText.length, errorPos + 100);
            console.error('[' + reqId + '] Context around error position ' + errorPos + ':', cleanedText.substring(contextStart, contextEnd));
            console.error('[' + reqId + '] Full text:', cleanedText);
            return res.status(500).json({
                error: 'Could not parse AI response as JSON',
                parseError: parseError.message,
                suggestions: []
            });
        }

        // Validate it's an array
        if (!Array.isArray(suggestions)) {
            console.error('[' + reqId + '] Parsed JSON is not an array:', typeof suggestions);
            return res.status(500).json({ error: 'AI response is not an array', suggestions: [] });
        }

        console.log('[' + reqId + '] Valid array with ' + suggestions.length + ' suggestions');

        // Validate and normalize each suggestion
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

        const validatedSuggestions = suggestions
            .filter(s => {
                if (!s || typeof s !== 'object') {
                    console.warn('[' + reqId + '] Skipping non-object:', JSON.stringify(s));
                    return false;
                }
                if (!s.text || typeof s.text !== 'string' || s.text.trim().length === 0) {
                    console.warn('[' + reqId + '] Skipping suggestion without text:', JSON.stringify(s));
                    return false;
                }
                return true;
            })
            .slice(0, 5)
            .map(s => {
                const rawCategory = String(s.category || '').toLowerCase().trim();
                const category = categoryMap[rawCategory];
                if (!category && rawCategory) {
                    console.warn('[' + reqId + '] Unknown category "' + s.category + '", defaulting to general');
                }
                return {
                    text: String(s.text).trim().slice(0, 100),
                    suggestedView: validViews.has(s.suggestedView) ? s.suggestedView : 'Day',
                    estimatedPoints: Math.min(50, Math.max(10, Number(s.estimatedPoints) || 20)),
                    category: category || 'general'
                };
            });

        console.log('[' + reqId + '] Validated ' + validatedSuggestions.length + ' of ' + suggestions.length + ' suggestions');

        if (validatedSuggestions.length === 0) {
            console.error('[' + reqId + '] No valid suggestions after validation');
            return res.status(500).json({ error: 'AI returned invalid suggestions', suggestions: [] });
        }

        return res.status(200).json({
            suggestions: validatedSuggestions,
            usage: data.usage || {}
        });
    } catch (err) {
        console.error('[' + reqId + '] Unexpected error:', err.name, err.message, err.stack);

        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'AI request timed out - try again', suggestions: [] });
        }

        return res.status(500).json({ error: 'Internal server error', suggestions: [] });
    }
}
