import { NextRequest, NextResponse } from 'next/server';

interface AIRequestBody {
  prompt: string;
  provider: {
    provider: 'groq' | 'openai' | 'anthropic' | 'custom';
    apiKey: string;
    model: string;
    baseUrl?: string;
    temperature?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: AIRequestBody = await request.json();
    const { prompt, provider } = body;

    if (!prompt || !provider?.apiKey) {
      return NextResponse.json(
        { error: 'Missing prompt or API key' },
        { status: 400 }
      );
    }

    let response: string;

    switch (provider.provider) {
      case 'groq':
        response = await callGroq(prompt, provider);
        break;
      case 'openai':
        response = await callOpenAI(prompt, provider);
        break;
      case 'anthropic':
        response = await callAnthropic(prompt, provider);
        break;
      case 'custom':
        response = await callCustom(prompt, provider);
        break;
      default:
        return NextResponse.json(
          { error: 'Unknown provider' },
          { status: 400 }
        );
    }

    return NextResponse.json({ response });
  } catch (error) {
    console.error('AI API error:', error);
    return NextResponse.json(
      { error: 'AI request failed' },
      { status: 500 }
    );
  }
}

async function callGroq(
  prompt: string,
  config: AIRequestBody['provider']
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are an AI playing Magic: The Gathering. Respond with ONLY the letter of your chosen action. Be strategic but concise.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: 10,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(
  prompt: string,
  config: AIRequestBody['provider']
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an AI playing Magic: The Gathering. Respond with ONLY the letter of your chosen action. Be strategic but concise.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: 10,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(
  prompt: string,
  config: AIRequestBody['provider']
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || 'claude-3-haiku-20240307',
      max_tokens: 10,
      system:
        'You are an AI playing Magic: The Gathering. Respond with ONLY the letter of your chosen action.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callCustom(
  prompt: string,
  config: AIRequestBody['provider']
): Promise<string> {
  if (!config.baseUrl) throw new Error('Custom provider requires baseUrl');

  const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an AI playing Magic: The Gathering. Respond with ONLY the letter of your chosen action.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: 10,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
