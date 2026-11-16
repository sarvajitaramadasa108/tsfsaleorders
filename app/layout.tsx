import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TSF Sales Orders',
  description: 'Manual sales-order follow-up workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
