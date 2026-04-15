import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "비즈니스 오토파일럿 AI",
  description: "유튜브 수익화 전문 AI 어시스턴트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
