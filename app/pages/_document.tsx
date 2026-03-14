import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Script
          src="https://cdn.zama.org/relayer-sdk-js/0.4.1/relayer-sdk-js.umd.cjs"
          strategy="beforeInteractive"
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
