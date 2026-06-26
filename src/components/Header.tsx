import { Link } from "react-router-dom";
import logoBex from "@/assets/logo-bex.png";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center px-6 lg:px-12 h-16 lg:h-20">
        <Link to="/" className="flex items-center">
          <img
            src={logoBex}
            alt="BEX Auditoria"
            className="h-8 lg:h-10 w-auto object-contain"
          />
        </Link>
      </div>
    </header>
  );
};

export default Header;
