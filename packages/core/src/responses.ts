import type { CoreResponse } from './types';

export function ok(message: string): CoreResponse {
  return {
    status: 200,
    body: {
      type: 'success',
      message
    }
  };
}

export function error(
  status: number,
  message: string,
  originalError?: unknown
): CoreResponse {
  return {
    status,
    body: {
      type: 'error',
      message,
      error: originalError
    }
  };
}

export async function handlerCall(
  fn: () => Promise<CoreResponse>
): Promise<CoreResponse> {
  try {
    return await fn();
  } catch (originalError) {
    return error(
      500,
      "🔴 We're having some technical difficulties processing your request, please try again later.",
      originalError
    );
  }
}
