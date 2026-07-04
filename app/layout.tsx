import type { Metadata } from "next";
// 使用 @fontsource 自带字体文件（走 npm，不依赖 Google fonts.gstatic.com）
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/600.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/800.css";
import "@fontsource/titillium-web/300.css";
import "@fontsource/titillium-web/400.css";
import "@fontsource/titillium-web/600.css";
import "@fontsource/titillium-web/700.css";
import "@fontsource/noto-sans-sc/300.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "FinSight · 小白投资者智能投研驾驶舱",
  description:
    "FinSight 是面向小白投资者的金融投资研究与辅助决策系统，覆盖 A股/港股/美股/加密全市场，以 AI 研究助手为核心，串联行情、资讯、财务、技术分析、策略回测、观察池与信号提醒。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <div className="fs-aurora" aria-hidden />
        <div className="fs-grid" aria-hidden />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
