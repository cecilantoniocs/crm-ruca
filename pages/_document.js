// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        {/* Favicons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />

        {/* iOS (PNG con fondo sólido, sin transparencia) */}
        <link rel="apple-touch-icon" href="/icons/ios-180.png" />

        {/* PWA Manifest (iconos maskable) */}
        <link rel="manifest" href="/site.webmanifest" />

        {/* Tema del navegador */}
        <meta name="theme-color" content="#111827" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
