import React, { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main className="ml-20 lg:ml-[260px] pt-[73px] min-h-screen overflow-auto">
        <div className="px-4 py-6 lg:px-6 lg:py-8 max-w-[1240px] mx-auto">{children}</div>
      </main>
    </div>
  );
};
