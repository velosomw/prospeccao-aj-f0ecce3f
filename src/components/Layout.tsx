import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

const Layout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className={isHome ? "flex-1" : "flex-1 pt-16 lg:pt-20"}>{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
