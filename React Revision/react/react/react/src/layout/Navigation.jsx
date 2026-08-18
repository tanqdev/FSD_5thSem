import React from "react";
import { Search, Settings, User } from "lucide-react";

const Navigation = () => {
  return (
    <nav className="bg-neutral-950 border-b border-neutral-800 p-8 m-8 h-16 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-8">
        <span className="text-white font-semibold text-lg tracking-wide">
          MyApp
        </span>
        <div className="flex gap-6">
          <a
            href="#"
            className="text-neutral-400 text-sm hover:text-white transition-colors duration-200"
          >
            Home
          </a>
          <a
            href="#"
            className="text-neutral-400 text-sm hover:text-white transition-colors duration-200"
          >
            About
          </a>
        </div>
      </div>

      {/* Center: Search */}
      <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 gap-2 w-56">
        <Search size={14} className="text-neutral-500" />
        <input
          type="text"
          placeholder="Search..."
          className="bg-transparent outline-none text-neutral-300 text-sm w-full placeholder-neutral-600"
        />
      </div>

      {/* Right: Settings + Avatar */}
      <div className="flex items-center gap-5">
        <a
          href="#"
          className="text-neutral-400 text-sm hover:text-white transition-colors duration-200 flex items-center gap-1"
        >
          <Settings size={18} />
        </a>
        <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center cursor-pointer hover:border-neutral-500 transition-colors duration-200">
          <User size={16} className="text-neutral-400" />
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
