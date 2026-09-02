# Artifex Decor — website admin

An admin login at `/admin.html` that lets you change **any text and any image**
on the site without touching code. Edits save to Supabase and appear on the live
site immediately — there is no rebuild and no deploy.

---

## One-time setup (about 5 minutes)

### 1. Create the database table and image bucket

Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**.

This creates:

| What | Where | Who can read | Who can write |
|---|---|---|---|
| `site_content` table | Database | anyone (it is public website copy) | signed-in admins only |
| `site-images` bucket | Storage | anyone | signed-in admins only |

Row level security is on for both, so the public key in the browser can only
ever read.

### 2. Paste the anon key

Supabase dashboard → **Project Settings → API** → copy the **anon / public** key
(the long one starting `eyJ...`, *not* `service_role`).

Open `assets/cms-config.js` and replace the placeholder:

```js
anonKey: 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE',
```

This key is meant to be public — it is what the RLS policies above are for.
**Never put the `service_role` key in this file.**

### 3. Create the admin login

Supabase dashboard → **Authentication → Users → Add user**:

- Email: whoever should be able to edit the site
- Password: set one, and tick **Auto confirm user**

Repeat for each person who needs access. To remove someone, delete their user.

Then commit and push — Vercel redeploys automatically.

---

## Using it

1. Go to **`/admin.html`** and sign in.
2. You land on the homepage in edit mode. Every editable thing gets a dashed
   outline.
3. **Click any text** → a panel opens on the right with a box to type in. The
   page updates as you type.
4. **Click any image** → drop a new photo in, or click to choose one. Add alt
   text (the description used by screen readers and Google).
5. **Save** publishes to the live site straight away.
6. **Reset to original** on any element puts back what the page shipped with.

The toolbar switches between `index`, `gallery`, `terms` and `privacy`, and the
**SEO** button edits the browser tab title and the Google search description.

Unsaved changes are kept while you move around the page, but not across a
reload — the browser warns you before you lose them.

---

## How it works

Every editable element in the HTML carries a stable key:

```html
<h3 data-cms="index.services.h3_2" data-cms-type="text">Interior and exterior repaints</h3>
<img data-cms="index.services.img_3" data-cms-type="image" src="img/work-kitchen-pendants.jpg" ...>
```

`assets/cms.js` reads `site_content` and applies any row whose key matches.
The HTML in the repo is always the fallback: if Supabase is unreachable, if the
key is missing, or if a row is deleted, the page shows exactly what it shows
today. Nothing can white-screen the site.

Content types:

| `data-cms-type` | Meaning |
|---|---|
| `text` | Replaces the element's inner HTML. A few blocks contain `<b>` or `<a>` on purpose — the panel warns you when that is the case. |
| `textnodes` | Buttons with an icon. Only the words change, the icon is left alone. |
| `image` | Swaps `src` and `alt`. `srcset` is dropped on replaced images so the browser cannot fall back to the original file. |
| `attr:content` | The `<meta name="description">` tag. |

### Re-running the annotator

If the HTML is edited by hand later and new sections are added, re-run:

```bash
python3 tools/annotate.py index.html gallery.html terms.html privacy.html
```

It only ever inserts `data-cms` attributes and skips elements that already have
one, so existing keys — and therefore existing saved content — stay valid.

### Things worth knowing

- **Search engines see the HTML defaults, not the edited copy.** That was the
  accepted trade-off for instant publishing. If a change matters for SEO (page
  title, description, headings), fold it back into the HTML at some point.
- **Replaced images are served from Supabase Storage**, not from `/img`, and
  they skip the responsive `srcset` the original photos use. Resize photos to
  roughly 1600px wide and under ~1MB before uploading.
- **Uploads are never deleted automatically.** Old files stay in the bucket; tidy
  them up in the Supabase dashboard if it gets cluttered.
- `/admin.html` is `noindex` and disallowed in `robots.txt`.
