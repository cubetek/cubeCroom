import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

// Emit the index during static export; search runs locally in the visitor's browser.
export const dynamic = 'force-static';
export const { staticGET: GET } = createFromSource(source, { language: 'arabic' });
