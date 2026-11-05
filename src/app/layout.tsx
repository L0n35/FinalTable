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

// Only the one heavy slanted cut, because the poster headings are the only thing that use it.
const barlowPoster = Barlow_Condensed({
  variable: "--font-barlow-poster",
  subsets: ["latin"],
  weight: "800",
  style: "italic",
});

export const metadata: Metadata = {
  title: "Final Table",
  description: "Predict how the league will finish, then see who called it.",
};

// Pages are cached for everyone, so the server can't say who's signed in before the first paint. This
// stops the visitors' welcome flashing up for players, and SessionMarker corrects any wrong guess.
const SESSION_GUESS = `if(document.cookie.includes("-auth-token"))document.documentElement.setAttribute("data-session","")`;

export const viewport: Viewport = {
  themeColor: "#12170f",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${barlowPoster.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SESSION_GUESS }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
