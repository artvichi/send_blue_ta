/**
 * `npm run gateway:setup`
 *
 * Checks the two macOS permissions the real driver needs and walks through
 * granting whichever is missing. Safe to re-run; it does nothing when both are
 * already in place.
 */
import { runDoctor } from './doctor.js';

const result = await runDoctor();
process.exit(result.ready ? 0 : 1);
