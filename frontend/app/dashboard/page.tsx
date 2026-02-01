'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    Layers, Trophy, FileText, TrendingUp, Clock,
    Target, Zap, ArrowRight, Plus, Play,
    CheckCircle, BookOpen, Brain, Sparkles
} from 'lucide-react';
import { progressApi, flashcardsApi, documentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface DashboardStats {
    total_documents: number;
    total_decks: number;
    total_flashcards: number;
    total_quizzes: number;
    cards_reviewed_today: number;
    cards_due_today: number;
    current_streak: number;
    total_xp: number;
    weekly_progress: number[];
    weekly_study_minutes: number;
}

export default function DashboardPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const [dashboardData, recsData] = await Promise.all([
                progressApi.getDashboard(),
                progressApi.getRecommendations(),
            ]);
            setStats(dashboardData);
            setRecommendations(recsData.recommendations || []);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const quickActions = [
        {
            href: '/dashboard/documents',
            label: 'Upload Document',
            icon: Plus,
            color: 'from-blue-500 to-cyan-500',
            desc: 'Add new study material'
        },
        {
            href: '/dashboard/flashcards',
            label: 'Review Flashcards',
            icon: Play,
            color: 'from-purple-500 to-pink-500',
            desc: `${stats?.cards_due_today || 0} cards due`
        },
        {
            href: '/dashboard/quizzes',
            label: 'Take a Quiz',
            icon: Trophy,
            color: 'from-orange-500 to-red-500',
            desc: 'Test your knowledge'
        },
        {
            href: '/dashboard/chat',
            label: 'Ask AI',
            icon: Brain,
            color: 'from-green-500 to-emerald-500',
            desc: 'Get help with concepts'
        },
    ];

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 skeleton rounded-lg" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-32 skeleton rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Welcome Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        Welcome back, <span className="gradient-text">{user?.full_name?.split(' ')[0] || user?.username}!</span>
                    </h1>
                    <p className="text-gray-400 mt-1">
                        {stats?.cards_due_today
                            ? `You have ${stats.cards_due_today} flashcards to review today.`
                            : "You're all caught up! Great job!"}
                    </p>
                </div>

                <Link
                    href="/dashboard/flashcards"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold hover:shadow-glow transition-shadow"
                >
                    <Play className="w-5 h-5" />
                    Start Studying
                </Link>
            </motion.div>

            {/* Stats Grid */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
                <div className="glass rounded-2xl p-6 hover-lift">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <Layers className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats?.total_flashcards || 0}</p>
                            <p className="text-gray-400 text-sm">Total Flashcards</p>
                        </div>
                    </div>
                </div>

                <div className="glass rounded-2xl p-6 hover-lift">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats?.cards_reviewed_today || 0}</p>
                            <p className="text-gray-400 text-sm">Reviewed Today</p>
                        </div>
                    </div>
                </div>

                <div className="glass rounded-2xl p-6 hover-lift">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Trophy className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats?.total_quizzes || 0}</p>
                            <p className="text-gray-400 text-sm">Quizzes Taken</p>
                        </div>
                    </div>
                </div>

                <div className="glass rounded-2xl p-6 hover-lift">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                            <Zap className="w-6 h-6 text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats?.total_xp || user?.total_xp || 0}</p>
                            <p className="text-gray-400 text-sm">Total XP</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {quickActions.map((action, index) => (
                        <Link
                            key={index}
                            href={action.href}
                            className="group glass rounded-2xl p-6 hover-lift"
                        >
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                <action.icon className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-1">{action.label}</h3>
                            <p className="text-gray-400 text-sm">{action.desc}</p>
                        </Link>
                    ))}
                </div>
            </motion.div>

            {/* Two Column Layout */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Weekly Progress */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white">Weekly Progress</h2>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-400">{stats?.weekly_study_minutes || 0} min this week</span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between gap-2 h-40">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                            const value = stats?.weekly_progress?.[index] || 0;
                            const maxValue = Math.max(...(stats?.weekly_progress || [1]), 1);
                            const height = (value / maxValue) * 100 || 10;

                            return (
                                <div key={day} className="flex-1 flex flex-col items-center gap-2">
                                    <div
                                        className="w-full bg-gradient-to-t from-primary-500 to-accent-500 rounded-t-lg transition-all"
                                        style={{ height: `${height}%`, minHeight: '10%' }}
                                    />
                                    <span className="text-xs text-gray-500">{day}</span>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Recommendations */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Sparkles className="w-5 h-5 text-accent-400" />
                        <h2 className="text-xl font-bold text-white">Recommendations</h2>
                    </div>

                    <div className="space-y-4">
                        {recommendations.length > 0 ? (
                            recommendations.slice(0, 3).map((rec, index) => (
                                <div
                                    key={index}
                                    className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rec.priority === 'high' ? 'bg-red-500/20' :
                                            rec.priority === 'medium' ? 'bg-yellow-500/20' : 'bg-green-500/20'
                                        }`}>
                                        <Target className={`w-5 h-5 ${rec.priority === 'high' ? 'text-red-400' :
                                                rec.priority === 'medium' ? 'text-yellow-400' : 'text-green-400'
                                            }`} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white font-medium">{rec.topic || rec.action}</p>
                                        <p className="text-gray-400 text-sm">{rec.reason}</p>
                                    </div>
                                    <ArrowRight className="w-5 h-5 text-gray-500" />
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8">
                                <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                <p className="text-gray-400">Upload documents and start studying to get personalized recommendations!</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Recent Activity */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass rounded-2xl p-6"
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Your Learning Stats</h2>
                    <Link href="/dashboard/progress" className="text-primary-400 hover:text-primary-300 text-sm font-medium flex items-center gap-1">
                        View All <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <FileText className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{stats?.total_documents || 0}</p>
                        <p className="text-gray-400 text-sm">Documents</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <Layers className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{stats?.total_decks || 0}</p>
                        <p className="text-gray-400 text-sm">Decks</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <Target className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{stats?.cards_due_today || 0}</p>
                        <p className="text-gray-400 text-sm">Due Today</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <TrendingUp className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{stats?.current_streak || user?.current_streak || 0}</p>
                        <p className="text-gray-400 text-sm">Day Streak</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
