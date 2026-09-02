/* Everest Painters CMS — public configuration.

   This points at the Principal Synergy Supabase project, which also holds the
   CRM. Everest's content lives in its own table (everest_site_content) and its
   own bucket (everest-site-images); see principal-synergy migration 0047_everest_site_cms.sql.

   The key below is a publishable key. It is safe in the browser: what it can
   actually do is fixed by row level security — anyone may read the content,
   only a user listed in everest_site_editors may write it.
   Do NOT put the service_role key here. */
window.CMS_CONFIG = {
  url: 'https://okwjuvhjrwidhqtzeguv.supabase.co',
  anonKey: 'PASTE_PUBLISHABLE_KEY_HERE',
  bucket: 'everest-site-images'
};
