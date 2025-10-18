// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        {/* Favicons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=2" />

        {/* Apple */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />

        {/* PWA Manifest */}
        <link rel="manifest" href="/site.webmanifest?v=2" />

        {/* Tema del navegador (coincide con manifest) */}
        <meta name="theme-color" content="#111827" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
