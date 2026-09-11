import { Router } from 'express';
import {
  createRecipientSchema,
  listRecipientsQuerySchema,
  parseHandle,
  updateRecipientSchema,
  type CreateRecipientInput,
  type ListRecipientsQuery,
  type UpdateRecipientInput,
} from '@sb/shared';
import { asyncRoute } from '../middleware/error-handler.js';
import { pathParam } from '../params.js';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validate.js';
import { badRequest, conflict, notFound } from '../errors.js';
import {
  createRecipient,
  deleteRecipient,
  messageCountsByHandle,
  updateRecipient,
} from '../../repositories/recipients.js';
import { listRecipients, toRecipientDto } from '../../services/recipients.js';
import { logger } from '../../config/logger.js';

export const recipientsRouter = Router();

/** The address book, searchable by name or handle. */
recipientsRouter.get(
  '/',
  validateQuery(listRecipientsQuerySchema),
  asyncRoute(async (_req, res) => {
    const query = validatedQuery<ListRecipientsQuery>(res);
    res.json(await listRecipients(query.q, query.limit));
  }),
);

/**
 * The handle is normalized here exactly as a message's recipient is, so the
 * two always compare equal and a recipient's history is found by that string.
 */
recipientsRouter.post(
  '/',
  validateBody(createRecipientSchema),
  asyncRoute(async (req, res) => {
    const { name, to } = req.body as CreateRecipientInput;
    const handle = parseHandle(to);
    if (!handle.ok) throw badRequest(handle.reason, [{ field: 'to', message: handle.reason }]);

    const result = await createRecipient(name, handle.handle);
    if (!result.ok) throw conflict('That phone number or email is already in your recipients');

    logger.info({ recipientId: result.recipient.id }, 'recipient added');
    res.status(201).json(toRecipientDto(result.recipient, 0));
  }),
);

recipientsRouter.patch(
  '/:id',
  validateBody(updateRecipientSchema),
  asyncRoute(async (req, res) => {
    const id = pathParam(req, 'id');
    const { name, to } = req.body as UpdateRecipientInput;

    const patch: { name?: string; handle?: string } = {};
    if (name !== undefined) patch.name = name;
    if (to !== undefined) {
      const handle = parseHandle(to);
      if (!handle.ok) throw badRequest(handle.reason, [{ field: 'to', message: handle.reason }]);
      patch.handle = handle.handle;
    }

    const result = await updateRecipient(id, patch);
    if (!result.ok) {
      if (result.reason === 'not-found') throw notFound('No recipient with that id');
      throw conflict('That phone number or email is already in your recipients');
    }

    const counts = await messageCountsByHandle([result.recipient.handle]);
    res.json(toRecipientDto(result.recipient, counts.get(result.recipient.handle) ?? 0));
  }),
);

/** Removing a recipient forgets the name; their message history is untouched. */
recipientsRouter.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = pathParam(req, 'id');
    if (!(await deleteRecipient(id))) throw notFound('No recipient with that id');
    res.status(204).end();
  }),
);
