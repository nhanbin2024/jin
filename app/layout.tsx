import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'QuyNhon AI | Live OnChain Finance OS',
  description: 'A live-only multi-layer on-chain finance operating system powered by SoSoValue Research, SoDEX Trading API and an OpenAI-compatible AI router.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
