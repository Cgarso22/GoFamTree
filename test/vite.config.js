import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
export default defineConfig({ root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: { alias: { '@supabase/supabase-js': fileURLToPath(new URL('./fake-supabase.js', import.meta.url)) } },
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"x"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"x"' } });
