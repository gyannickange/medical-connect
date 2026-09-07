import React, { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
      />
      <Header onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
      <main className="lg:ml-[260px] pt-[73px] min-h-screen overflow-auto">
        <div className="px-4 py-6 lg:px-6 lg:py-8 max-w-[1240px] mx-auto">{children}</div>
      </main>
    </div>
  );
};
