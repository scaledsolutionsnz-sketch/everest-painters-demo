#!/usr/bin/env python3
"""Inject stable data-cms keys into the Artifex Decor static pages.

Works on the raw source text: bs4 is used only to locate elements, then the
attribute is spliced in at the recorded source offset. Nothing else in the file
moves, so the diff is only ever ' data-cms="..."' insertions.

Idempotent: elements that already carry data-cms are left alone.
"""
import sys, re
from bs4 import BeautifulSoup, Tag, NavigableString, Comment

SKIP_TREE   = {"script", "style", "svg", "noscript", "template", "head", "iframe"}
INLINE_OK   = {"b", "strong", "em", "i", "u", "span", "br", "small", "sup",
               "sub", "mark", "abbr", "time", "wbr", "s"}
# Containers we always descend into rather than treat as one editable blob.
NEVER_LEAF  = {"body", "main", "header", "footer", "nav", "section", "article",
               "aside", "form", "ul", "ol", "dl", "table", "thead", "tbody",
               "tr", "picture", "figure", "video", "audio"}


def el_text(el):
    return el.get_text(" ", strip=True)


def classify(el):
    """Return 'text', 'textnodes', or None for an element."""
    if el.name in NEVER_LEAF or not el_text(el):
        return None
    # Descendants, ignoring everything inside an <svg> (paths, groups, titles).
    kids = [k for k in el.find_all(True)
            if not any(a.name == "svg" for a in k.parents)]
    if any(k.name in SKIP_TREE - {"svg"} for k in kids):
        return None
    has_opaque = any(k.name in ("svg", "img", "canvas", "picture") for k in kids)
    direct = [c for c in el.children
              if isinstance(c, NavigableString) and not isinstance(c, Comment)
              and c.strip()]
    # <a> counts as inline only inside prose, i.e. when the element also has
    # bare text of its own. A container of nothing but links is descended into
    # so each link stays separately editable.
    inline = INLINE_OK | ({"a"} if direct else set())
    others = [k for k in kids if k.name not in inline
              and k.name not in ("svg", "img", "canvas", "picture")]
    if others:
        return None                      # real block children -> descend
    if not direct and any(k.name not in ("svg", "img", "canvas", "picture")
                          for k in el.find_all(True, recursive=False)):
        # Pure wrapper: every scrap of text lives inside child elements
        # (line-mask spans, for example). Key the children so the editor
        # offers plain sentences instead of markup.
        return None
    if has_opaque:
        # Icon + label. Only the bare text nodes are editable, icons survive.
        return "textnodes" if direct else None
    return "text"


def collect(soup, page):
    """Yield (element, key, kind) in document order."""
    hits = []
    counters = {}

    def section_of(el):
        for p in el.parents:
            if p.get("id"):
                return re.sub(r"[^a-z0-9]+", "-", p["id"].lower()).strip("-")
            if p.name in ("header", "footer") :
                return p.name
        return "page"

    def key_for(el, tag):
        sec = section_of(el)
        slot = f"{page}.{sec}.{tag}"
        counters[slot] = counters.get(slot, 0) + 1
        return f"{slot}_{counters[slot]}"

    def visit(el):
        if el.name in SKIP_TREE:
            return
        if el.get("data-cms"):
            return
        if el.name == "img":
            hits.append((el, key_for(el, "img"), "image"))
            return
        kind = classify(el)
        if kind:
            hits.append((el, key_for(el, el.name), kind))
            return
        for child in el.children:
            if isinstance(child, Tag):
                visit(child)

    visit(soup.body)
    return hits


def line_offsets(src):
    offs, pos = [0], 0
    for line in src.splitlines(keepends=True):
        pos += len(line)
        offs.append(pos)
    return offs


def annotate(path, page):
    src = open(path, encoding="utf-8").read()
    soup = BeautifulSoup(src, "html.parser")
    offs = line_offsets(src)

    inserts = []          # (absolute_offset, text_to_insert)
    stats = {"text": 0, "textnodes": 0, "image": 0, "href": 0}

    for el, key, kind in collect(soup, page):
        if el.sourceline is None:
            continue
        start = offs[el.sourceline - 1] + el.sourcepos
        # splice directly after "<tagname"
        at = start + 1 + len(el.name)
        if src[start] != "<" or not src.startswith(el.name, start + 1):
            print(f"  !! offset mismatch for {key}, skipped", file=sys.stderr)
            continue
        attrs = f' data-cms="{key}" data-cms-type="{kind}"'
        stats[kind] += 1
        if kind != "image" and el.name == "a":
            href = el.get("href", "")
            if href.startswith("tel:") or href.startswith("mailto:"):
                attrs += ' data-cms-href="1"'
                stats["href"] += 1
        inserts.append((at, attrs))

    # <title> and <meta name="description">
    head_extras = []
    t = soup.find("title")
    if t is not None and not t.get("data-cms") and t.sourceline:
        at = offs[t.sourceline - 1] + t.sourcepos + len("<title")
        head_extras.append((at, f' data-cms="{page}.meta.title" data-cms-type="text"'))
    m = soup.find("meta", attrs={"name": "description"})
    if m is not None and not m.get("data-cms") and m.sourceline:
        at = offs[m.sourceline - 1] + m.sourcepos + len("<meta")
        head_extras.append((at, f' data-cms="{page}.meta.description" data-cms-type="attr:content"'))
    inserts += head_extras

    for at, text in sorted(inserts, key=lambda x: -x[0]):
        src = src[:at] + text + src[at:]

    open(path, "w", encoding="utf-8").write(src)
    print(f"{path:16s} text={stats['text']:3d} textnodes={stats['textnodes']:3d} "
          f"images={stats['image']:3d} links={stats['href']:3d} "
          f"meta={len(head_extras)}")


if __name__ == "__main__":
    for path in sys.argv[1:]:
        annotate(path, path.rsplit("/", 1)[-1].replace(".html", ""))
