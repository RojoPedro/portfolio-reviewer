import React from 'react';
import { Skull } from 'lucide-react';

const Header = () => {
    return (
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-2">
                <Skull className="w-8 h-8 text-red-500" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                    Ruthless Recruiter
                </h1>
            </div>
            <nav>
                <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                    GitHub
                </a>
            </nav>
        </header>
    );
};

export default Header;
