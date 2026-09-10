import { Router } from 'express';
import {
  createMessageSchema,
  listMessagesQuerySchema,
  parsePhone,
  type ListMessagesQuery,
} from '@sb/shared';
import { asyncRoute } from '../middleware/error-handler.js';
import { pathParam } from '../params.js';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validate.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { forceDispatch } from '../../repositories/message-queue.js';
import { cancelMessage, createMessage, retryMessage } from '../../repositories/messages.js';
import { getMessageDetail, listMessages, listQueue } from '../../services/messages.js';
import { logger } from '../../config/logger.js';

export const messagesRouter = Router();

/**
 * Schedule a message.
 *
 * The number is normalized to E.164 here, at the edge, so that every downstream
 * consumer -- the queue, the gateway, chat.db correlation -- compares the same
 * string rather than whatever the user happened to type.
 */
messagesRouter.post(
  '/',
  validateBody(createMessageSchema),
  asyncRoute(async (req, res) => {
    const { to, body } = req.body as { to: string; body: string };

    const phone = parsePhone(to);
    if (!phone.ok) throw badRequest(phone.reason, [{ field: 'to', message: phone.reason }]);

    const message = await createMessage(phone.e164, body);
    logger.info({ messageId: message.id }, 'message scheduled');

    const detail = await getMessageDetail(message.id);
    res.status(201).json(detail);
  }),
);

/** Dashboard listing: newest first, optionally filtered, cursor paginated. */
messagesRouter.get(
  '/',
  validateQuery(listMessagesQuerySchema),
  asyncRoute(async (_req, res) => {
    const query = validatedQuery<ListMessagesQuery>(res);
    res.json(
      await listMessages({
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      }),
    );
  }),
);

/** Scheduler screen: the queue in the order it will actually be sent. */
messagesRouter.get(
  '/queue',
  validateQuery(listMessagesQuerySchema),
  asyncRoute(async (_req, res) => {
    const query = validatedQuery<ListMessagesQuery>(res);
    res.json(await listQueue(query.limit));
  }),
);

messagesRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = pathParam(req, 'id');
    const detail = await getMessageDetail(id);
    if (!detail) throw notFound('No message with that id');
    res.json(detail);
  }),
);

/** Cancel, which is only possible while the message is still queued. */
messagesRouter.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = pathParam(req, 'id');
    const result = await cancelMessage(id);
    if (!result.ok) {
      if (result.reason === 'not-found') throw notFound('No message with that id');
      throw conflict(
        `A ${result.status} message cannot be cancelled -- it may already have been sent`,
        { status: result.status },
      );
    }
    res.json(await getMessageDetail(id));
  }),
);

messagesRouter.post(
  '/:id/retry',
  asyncRoute(async (req, res) => {
    const id = pathParam(req, 'id');
    const result = await retryMessage(id);
    if (!result.ok) {
      if (result.reason === 'not-found') throw notFound('No message with that id');
      throw conflict(`Only a failed message can be retried; this one is ${result.status}`, {
        status: result.status,
      });
    }
    logger.info({ messageId: id }, 'message requeued');
    res.json(await getMessageDetail(id));
  }),
);

/** Operator override: jump the queue and bypass the rate gate exactly once. */
messagesRouter.post(
  '/:id/send-now',
  asyncRoute(async (req, res) => {
    const id = pathParam(req, 'id');
    const result = await forceDispatch(id);
    if (!result.ok) {
      if (result.reason === 'not-found') throw notFound('No message with that id');
      throw conflict(`Only a queued message can be sent now; this one is ${result.status}`, {
        status: result.status,
      });
    }
    logger.info({ messageId: id }, 'send-now override set');
    res.json(await getMessageDetail(id));
  }),
);
