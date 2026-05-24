// Realtime broadcaster (Socket.IO).
//
// One Socket.IO server instance attached to the main HTTP server. Clients
// authenticate during the handshake with the same JWT they use for REST.
// On connect, every authenticated socket auto-joins two rooms:
//   - user:<userId>   for direct messages to one user
//   - role:<userType> for fan-out to all users of a role (e.g. super_admins)
//
// Service contract — controllers / services emit via:
//   RealtimeService.emitToUser(userId, event, payload)
//   RealtimeService.emitToRole(role,   event, payload)
//
// Both are fire-and-forget no-ops if the realtime service hasn't been
// initialized yet (e.g. in unit tests where we mount the express app
// without starting an HTTP server). That lets every callsite be unguarded.
//
// Event names — keep them stable; clients depend on them. Current set:
//   - video-course:created         (super_admins receive — new pending course)
//   - video-course:approved        (teacher receives    — admin approved)
//   - video-course:rejected        (teacher receives    — admin rejected)
//   - video-lesson:status_changed  (teacher receives    — Bunny ready/failed)

import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server as IoServer, type Socket } from 'socket.io';

import { TokenModel } from '../models/token.model';
import { UserModel } from '../models/user.model';
import { logger } from '../utils/logger';

interface SocketUser {
  id: string;
  userType: string;
}

let io: IoServer | null = null;

export const RealtimeService = {
  /**
   * Attach a Socket.IO server to the given HTTP server. Called once from
   * `startServer()` in `src/index.ts`.
   *
   * The CORS origin allowlist is shared with the REST surface — same env
   * var, same fallback. WebSocket upgrades from any other origin are
   * rejected at handshake time by Socket.IO.
   */
  attach(httpServer: HttpServer, allowedOrigins: string[]): IoServer {
    if (io) return io;

    io = new IoServer(httpServer, {
      path: '/socket.io',
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) return callback(null, true);
          logger.warn({ origin }, 'Socket.IO CORS rejected');
          return callback(new Error('CORS not allowed'), false);
        },
        credentials: true,
      },
      // Defaults are conservative; expose only what the client needs.
      pingTimeout: 30000,
      pingInterval: 25000,
    });

    // ----- JWT authentication ---------------------------------------------
    //
    // The client passes the JWT in two supported ways (matching the chat
    // service convention so the Flutter / Dashboard socket layers can be
    // identical):
    //   1. socket.handshake.auth.token  (preferred — io({ auth: { token } }))
    //   2. socket.handshake.query.token (legacy fallback)
    //
    // We re-run the SAME validation as the REST middleware (DB token row
    // check + jwt.verify + user status='active'). A failed handshake
    // surfaces to the client as a connect_error.
    io.use(async (socket, next) => {
      try {
        const tokenRaw =
          (socket.handshake.auth?.['token'] as string | undefined) ||
          (socket.handshake.query?.['token'] as string | undefined);
        if (!tokenRaw) return next(new Error('UNAUTHORIZED'));

        const dbToken = await TokenModel.findByToken(tokenRaw);
        if (!dbToken) return next(new Error('TOKEN_INVALID'));

        const secret = process.env['JWT_SECRET'];
        if (!secret) return next(new Error('INTERNAL_ERROR'));

        const decoded = jwt.verify(tokenRaw, secret) as { userId?: string };
        if (!decoded.userId) return next(new Error('TOKEN_INVALID'));

        const user = await UserModel.findById(decoded.userId);
        if (!user) return next(new Error('UNAUTHORIZED'));
        if (user.status !== 'active') return next(new Error('ACCOUNT_INACTIVE'));

        (socket as Socket & { user?: SocketUser }).user = {
          id: String(user.id),
          userType: String(user.userType),
        };
        next();
      } catch (err) {
        logger.warn({ err }, 'Socket auth failed');
        next(err instanceof Error ? err : new Error('UNAUTHORIZED'));
      }
    });

    io.on('connection', (socket) => {
      const u = (socket as Socket & { user?: SocketUser }).user;
      if (!u) {
        socket.disconnect(true);
        return;
      }
      socket.join(`user:${u.id}`);
      socket.join(`role:${u.userType}`);

      // Lightweight client → server ping for clients that want to confirm
      // auth survived a reconnect. Server replies with the bound user id.
      socket.on('whoami', (cb) => {
        if (typeof cb === 'function') cb({ id: u.id, userType: u.userType });
      });
    });

    logger.info('Socket.IO attached');
    return io;
  },

  /**
   * Push an event to a single user across all their connected sockets
   * (web tab + mobile + tablet). No-op if the user has no live connection.
   */
  async emitToUser(userId: string, event: string, payload: unknown): Promise<void> {
    if (!io || !userId) {
      logger.warn(
        { event, userId, ioReady: !!io },
        '[realtime] emitToUser SKIPPED (io not ready or empty userId)'
      );
      return;
    }
    const room = `user:${userId}`;
    // socket.io v4: fetch sockets currently in the room so we can log
    // delivery cardinality. This is the missing diagnostic for "I called
    // emit but the client never received it" — usually means the user
    // simply isn't connected right now.
    try {
      const sockets = await io.in(room).fetchSockets();
      logger.info(
        { event, userId, room, recipients: sockets.length },
        sockets.length > 0
          ? '[realtime] 📤 emitToUser'
          : '[realtime] ⚠️  emitToUser with 0 recipients (user offline)'
      );
    } catch (err) {
      logger.warn({ err, event, userId }, '[realtime] fetchSockets failed');
    }
    io.to(room).emit(event, payload);
  },

  /**
   * Push an event to every user of a given role. Used for super-admin
   * broadcasts (e.g. a new video course pending review).
   */
  async emitToRole(role: string, event: string, payload: unknown): Promise<void> {
    if (!io || !role) {
      logger.warn({ event, role, ioReady: !!io }, '[realtime] emitToRole SKIPPED');
      return;
    }
    const room = `role:${role}`;
    try {
      const sockets = await io.in(room).fetchSockets();
      logger.info(
        { event, role, room, recipients: sockets.length },
        '[realtime] 📤 emitToRole'
      );
    } catch (err) {
      logger.warn({ err, event, role }, '[realtime] fetchSockets failed');
    }
    io.to(room).emit(event, payload);
  },
};
