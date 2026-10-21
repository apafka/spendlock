export const metadata = { title: 'Spendlock — pay per verified result' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '40px auto', padding: '0 16px', lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  );
}
