// Envoi Telegram : le corps de la requête doit parler HTTP Telegram (« chat_id », pas « chatId »),
// et une erreur Telegram doit remonter avec sa description plutôt qu'un vague code.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { recentChats, sendMessage } from './telegram';

const okResponse = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

function captureFetch(): { calls: { url: string; body: Record<string, unknown> }[] } {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: _url, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    return okResponse({ ok: true, result: [] });
  }));
  return { calls };
}

describe('telegram', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sendMessage envoie chat_id (le nom que l’API attend) et le texte, sans troncature inutile', async () => {
    const { calls } = captureFetch();
    await sendMessage('123:abc', '9876543210', 'Palier atteint sur SOL');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/bot123:abc/sendMessage');
    expect(calls[0].body).toEqual({ chat_id: '9876543210', text: 'Palier atteint sur SOL' });
  });

  it('un message trop long est tronqué sous la limite de 4096 caractères', async () => {
    const { calls } = captureFetch();
    await sendMessage('123:abc', '9876543210', 'x'.repeat(5000));
    expect((calls[0].body.text as string).length).toBeLessThanOrEqual(4096);
  });

  it('une erreur Telegram est levée avec sa description, et un chat inconnu explique le remède', async () => {
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> =>
      new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat_id is empty' }), { status: 400 })));
    await expect(sendMessage('123:abc', '', 'Coucou')).rejects.toThrow('chat_id is empty');
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> =>
      new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), { status: 400 })));
    await expect(sendMessage('123:abc', '1', 'Coucou')).rejects.toThrow('--discover');
  });

  it('recentChats ne garde que les conversations privées, les plus récentes d’abord', async () => {
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => okResponse({
      ok: true,
      result: [
        { message: { chat: { id: 111, type: 'private', first_name: 'Niko' }, date: 200 } },
        { message: { chat: { id: -555, type: 'group', title: 'Un groupe' }, date: 300 } },
        { message: { chat: { id: 222, type: 'private', first_name: 'Autre' }, date: 100 } },
      ],
    })));
    expect(await recentChats('123:abc')).toEqual([
      { chatId: '111', title: 'Niko', date: 200 },
      { chatId: '222', title: 'Autre', date: 100 },
    ]);
  });
});
