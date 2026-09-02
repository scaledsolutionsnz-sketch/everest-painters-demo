/* Artifex Decor CMS — public configuration.
   The anon key is a public, publishable key. It is safe in the browser: what
   it can actually do is fixed by the row level security policies in
   supabase/schema.sql (anyone may read site_content, only a signed-in admin
   may write it). Do NOT put the service_role key here. */
window.CMS_CONFIG = {
  url: 'https://okwjuvhjrwidhqtzeguv.supabase.co',
  anonKey: 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE',
  bucket: 'site-images'
};
