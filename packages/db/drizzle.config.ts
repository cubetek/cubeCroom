import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  // الترحيلات تُولَّد ثم تُراجَع يدوياً وتُلتزم في المستودع.
  // لا `push` على قاعدة معلم: التغيير يمرّ بملف ترحيل مسمّى ومُراجَع.
  strict: true,
  verbose: true,
});
