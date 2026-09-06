import { z } from 'zod';

const httpsUrl = z.string().url().refine((url) => url.startsWith('https://'));
export const legalInfoSchema = z.object({
  version: z.string(),
  license: z.string(),
  copyright: z.string(),
  sourceUrl: httpsUrl,
  sourceArchiveUrl: httpsUrl.nullable(),
  commit: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  licenseText: z.string().min(1).max(100_000),
  noticesAvailable: z.boolean(),
});
export type LegalInfo = z.infer<typeof legalInfoSchema>;
