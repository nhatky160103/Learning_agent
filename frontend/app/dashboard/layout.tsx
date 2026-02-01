'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, LayoutDashboard, FileText, Layers, Trophy,
    TrendingUp, MessageCircle, Settings, LogOut, Menu,
    X, ChevronRight, Flame, Zap
} from 'lucide-react';
import { useAuthStore, useUIStore } from '@/lib/store';

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/documents', label: 'Documents', icon: FileText },
    { href: '/dashboard/flashcards', label: 'Flashcards', icon: Layers },
    { href: '/dashboard/quizzes', label: 'Quizzes', icon: Trophy },
    { href: '/dashboard/progress', label: 'Progress', icon: TrendingUp },
    { href: '/dashboard/chat', label: 'AI Chat', icon: MessageCircle },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isAuthenticated, logout } = useAuthStore();
    const { sidebarOpen, toggleSidebar } = useUIStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && !isAuthenticated) {
            router.push('/login');
        }
    }, [mounted, isAuthenticated, router]);

    if (!mounted || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const handleLogout = () => {
        logout();
        localStorage.removeItem('token');
        router.push('/');
    };

    return (
        <div className="min-h-screen flex">
            {/* Sidebar - Desktop */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.aside
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 280, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="hidden lg:flex flex-col h-screen sticky top-0 glass border-r border-white/10"
                    >
                        {/* Logo */}
                        <div className="p-6 border-b border-white/10">
                            <Link href="/dashboard" className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                    <Brain className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-xl font-bold gradient-text">LearnSmart</span>
                            </Link>
                        </div>

                        {/* User Stats */}
                        {user && (
                            <div className="p-4 mx-4 mt-4 rounded-xl bg-white/5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold">
                                        {user.full_name?.[0] || user.username[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">{user.full_name || user.username}</p>
                                        <p className="text-gray-400 text-sm truncate">{user.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-1">
                                        <Zap className="w-4 h-4 text-yellow-400" />
                                        <span className="text-gray-300">{user.total_xp || 0} XP</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Flame className="w-4 h-4 text-orange-400 streak-fire" />
                                        <span className="text-gray-300">{user.current_streak || 0} days</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Navigation */}
                        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                            {navItems.map((item) => {
                                const isActive = pathname === item.href ||
                                    (item.href !== '/dashboard' && pathname.startsWith(item.href));

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                                ? 'bg-gradient-to-r from-primary-500/20 to-accent-500/20 text-white border border-primary-500/30'
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <item.icon className={`w-5 h-5 ${isActive ? 'text-primary-400' : ''}`} />
                                        <span className="font-medium">{item.label}</span>
                                        {isActive && (
                                            <ChevronRight className="w-4 h-4 ml-auto text-primary-400" />
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Bottom Actions */}
                        <div className="p-4 border-t border-white/10 space-y-1">
                            <Link
                                href="/dashboard/settings"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                            >
                                <Settings className="w-5 h-5" />
                                <span className="font-medium">Settings</span>
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                                <LogOut className="w-5 h-5" />
                                <span className="font-medium">Logout</span>
                            </button>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {sidebarOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={toggleSidebar}
                            className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                        />
                        <motion.aside
                            initial={{ x: -300 }}
                            animate={{ x: 0 }}
                            exit={{ x: -300 }}
                            className="lg:hidden fixed left-0 top-0 bottom-0 w-72 glass z-50 flex flex-col"
                        >
                            {/* Same content as desktop sidebar */}
                            <div className="p-6 border-b border-white/10 flex items-center justify-between">
                                <Link href="/dashboard" className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                        <Brain className="w-6 h-6 text-white" />
                                    </div>
                                    <span className="text-xl font-bold gradient-text">LearnSmart</span>
                                </Link>
                                <button onClick={toggleSidebar} className="text-gray-400 hover:text-white">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                                {navItems.map((item) => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/dashboard' && pathname.startsWith(item.href));

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={toggleSidebar}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                                    ? 'bg-gradient-to-r from-primary-500/20 to-accent-500/20 text-white'
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            <item.icon className="w-5 h-5" />
                                            <span className="font-medium">{item.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>

                            <div className="p-4 border-t border-white/10">
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                >
                                    <LogOut className="w-5 h-5" />
                                    <span className="font-medium">Logout</span>
                                </button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="flex-1 min-w-0">
                {/* Top Bar */}
                <header className="sticky top-0 z-30 glass border-b border-white/10">
                    <div className="flex items-center justify-between px-4 lg:px-8 h-16">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        <div className="flex items-center gap-4">
                            {user && (
                                <div className="flex items-center gap-3">
                                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                        <Flame className="w-4 h-4 text-orange-400 streak-fire" />
                                        <span className="text-sm font-medium text-yellow-400">{user.current_streak || 0} day streak</span>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold">
                                        {user.full_name?.[0] || user.username[0].toUpperCase()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-4 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
