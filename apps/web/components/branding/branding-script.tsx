/**
 * BRAND-1 — applies the cached brand scale BEFORE first paint, so a returning
 * user never sees Aaramva green flash to their school's colour.
 *
 * Server component: this must land in the SSR'd HTML and execute during parse.
 * Same technique next-themes already uses in this app for dark mode (a raw
 * <script> + suppressHydrationWarning), rather than next/script
 * beforeInteractive, whose execution explicitly does not block hydration.
 *
 * The emitted SCRIPT text is import-free (it runs before any bundle loads), but
 * this component is a server component — so the constants below are evaluated at
 * render time and interpolated in. They are the same values lib/branding uses and
 * cannot drift from them.
 */
import { BRAND_STEPS } from '@/lib/branding/scale';
import { BRANDING_CACHE_VERSION, brandingCacheKey } from '@/lib/branding/cache';

// brandingCacheKey('') yields the bare 'branding:' prefix, which the script
// concatenates with the slug it reads — same key shape as lib/branding/cache.ts.
const KEY_PREFIX = JSON.stringify(brandingCacheKey(''));

// Reads the finished scale from the cache — no colour maths before paint.
const SCRIPT = `(function(){try{
if(location.pathname.indexOf('/super-admin')===0)return;
var slug=localStorage.getItem('tenant-slug');if(!slug)return;
var raw=localStorage.getItem(${KEY_PREFIX}+slug);if(!raw)return;
var b=JSON.parse(raw);if(!b||b.v!==${BRANDING_CACHE_VERSION}||!b.scale)return;
var el=document.documentElement;
var steps=${JSON.stringify(BRAND_STEPS)};
for(var i=0;i<steps.length;i++){var v=b.scale[steps[i]];if(v)el.style.setProperty('--color-brand-'+steps[i],v);}
if(b.scale[500])el.style.setProperty('--primary',b.scale[500]);
el.style.setProperty('--primary-foreground',b.fg||'#FFFFFF');
}catch(e){}})();`;

export function BrandingScript() {
  // The try/catch above is not optional: this runs before React, so an uncaught
  // throw here kills first paint for the whole app.
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
