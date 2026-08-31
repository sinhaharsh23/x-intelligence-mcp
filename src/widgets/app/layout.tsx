import './globals.css';

export const metadata = { title: 'X Intelligence MCP', description: 'Native NitroStack widgets for the official X API.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
