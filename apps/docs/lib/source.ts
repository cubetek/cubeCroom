import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';

/** The product landing page owns `/`; the guide and its navigation live under `/docs`. */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
