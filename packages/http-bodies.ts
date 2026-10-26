import { AppError } from './database/types';

/** Bound bytes while streaming: Content-Length is advisory, never the safety boundary. */
export async function boundedText(request: Request, maximumBytes = 65536): Promise<string> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('Invalid body bound');
  const claimed = request.headers.get('content-length');
  if (claimed && /^\d+$/.test(claimed) && Number(claimed) > maximumBytes)
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The submission exceeds the permitted size.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let count = 0, text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maximumBytes) {
        await reader.cancel();
        throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The submission exceeds the permitted size.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'BODY_INVALID', 'The submission is not valid UTF-8.');
  } finally {
    reader.releaseLock();
  }
}
