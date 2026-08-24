import React, { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--gradient-bg)" }}>
      <Sidebar />
      <Header />
      <main className="ml-20 lg:ml-64 pt-[72px] min-h-screen overflow-auto">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
};
