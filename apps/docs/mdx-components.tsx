import defaultComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Device, Screen } from '@/components/Screen';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultComponents, Screen, Device, ...components };
}
