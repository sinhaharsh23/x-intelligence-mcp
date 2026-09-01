import './globals.css';
import { WidgetLayout } from '@nitrostack/widgets';

export const metadata = { title: 'X Intelligence MCP', description: 'Native NitroStack widgets for the official X API.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WidgetLayout>{children}</WidgetLayout>
      </body>
    </html>
  );
}
