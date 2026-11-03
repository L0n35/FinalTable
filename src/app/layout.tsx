import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Final Table",
  description: "Predict how the league will finish, then see who called it.",
};

// Pages are cached for everyone, so the server can't say who's signed in before the first paint. This
// stops the visitors' welcome flashing up for players, and SessionMarker corrects any wrong guess.
const SESSION_GUESS = `if(document.cookie.includes("-auth-token"))document.documentElement.setAttribute("data-session","")`;

export const viewport: Viewport = {
  themeColor: "#0b1210",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SESSION_GUESS }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
