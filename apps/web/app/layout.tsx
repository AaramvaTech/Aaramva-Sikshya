import type { Metadata } from 'next';
import { Outfit, Noto_Sans_Devanagari } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { BrandingScript } from '@/components/branding/branding-script';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

// WEB-P Phase 1 Task 3 — Devanagari fallback for the Nepali locale. This is a
// CSS font-family fallback (see globals.css's --font-sans stack), not a
// per-component font-switcher: the browser natively uses this font for any
// glyph Outfit doesn't cover, everywhere in the app, with zero extra wiring.
const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari', 'latin'],
  variable: '--font-noto-devanagari',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Aaramva Shikshya',
  description: 'Simple school management for every school in Nepal.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${notoSansDevanagari.variable}`}
    >
      <body>
        <BrandingScript />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
