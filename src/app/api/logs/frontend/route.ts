import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';

const logger = createLogger('frontend-logs');

export const runtime = 'nodejs';

interface FrontendLogEntry {
  level: 'info' | 'warn' | 'error';
  prefix: string;
  message: string;
  context?: Record<string, any>;
  timestamp: string;
  url?: string;
  userAgent?: string;
}

interface BatchLogRequest {
  logs: FrontendLogEntry[];
}

/**
 * POST /api/logs/frontend
 *
 * Receives frontend logs and writes them to backend logger
 * Supports both single log and batch log formats.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > 32 * 1024) {
      return NextResponse.json({ success: false }, { status: 413 });
    }
    const body = JSON.parse(text);
    const logs: FrontendLogEntry[] = Array.isArray(body?.logs) ? body.logs : [body];
    if (!logs.length || logs.length > 20 || logs.some(entry =>
      !entry || typeof entry !== 'object' || Array.isArray(entry) ||
      !['info', 'warn', 'error'].includes(entry.level) ||
      typeof entry.prefix !== 'string' || entry.prefix.length > 100 ||
      typeof entry.message !== 'string' || entry.message.length > 2000 ||
      typeof entry.timestamp !== 'string' || entry.timestamp.length > 100 ||
      (entry.url !== undefined && (typeof entry.url !== 'string' || entry.url.length > 500)) ||
      (entry.userAgent !== undefined && (typeof entry.userAgent !== 'string' || entry.userAgent.length > 500)) ||
      (entry.context !== undefined && (!entry.context || typeof entry.context !== 'object' || Array.isArray(entry.context)))
    )) return NextResponse.json({ success: false }, { status: 400 });

    for (const entry of logs) {
      const { level, prefix, message, timestamp, url, userAgent } = entry;

      // Build log context
      const logContext = {
        source: 'frontend',
        prefix,
        url: url || request.headers.get('referer'),
        userAgent: userAgent || request.headers.get('user-agent'),
        clientTime: timestamp,
        userId: session.user.id,
      };

      // Log to backend using appropriate level
      switch (level) {
        case 'error':
          logger.error(logContext, message);
          break;
        case 'warn':
          logger.warn(logContext, message);
          break;
        case 'info':
        default:
          logger.info(logContext, message);
          break;
      }
    }

    return NextResponse.json({ success: true, count: logs.length });
  } catch (error) {
    logger.error({ error }, 'Failed to process frontend log');
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
