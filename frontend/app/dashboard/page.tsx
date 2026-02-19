'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    Layers, Trophy, FileText, TrendingUp, Clock,
    Target, Zap, ArrowRight, Plus, Play,
    CheckCircle, BookOpen, Brain, Sparkles, Flame
} from 'lucide-react';
import { progressApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface UserResponse {
    total_xp: number;
    current_streak: number;
    longest_streak: number;
    daily_goal_minutes: number;
    full_name?: string;
    username: string;
}

interface UserStats {
    total_documents: number;
    total_decks?: number;
    total_flashcards: number;
    total_quizzes_taken: number;
    total_study_time_minutes: number;
    cards_due_today: number;
    average_accuracy: number;
}

interface DailyProgress {
    date: string;
    study_time_minutes: number;
    cards_reviewed: number;
    quizzes_taken: number;
    accuracy: number;
}

interface ProgressDashboard {
    user: UserResponse;
    stats: UserStats;
    weekly_progress: DailyProgress[];
    topic_mastery: any[];
    due_flashcards_count: number;
    recommended_topics: string[];
    achievements_count: number;
    recent_achievements: string[];
}

interface StudyRecommendation {
    type: string;
    priority: number;
    title: string;
    description: string;
    estimated_time_minutes: number;
    resource_id?: string;
    resource_type?: string;
}

export default function DashboardPage() {
    const { user } = useAuthStore();
    const [data, setData] = useState<ProgressDashboard | null>(null);
    const [recommendations, setRecommendations] = useState<StudyRecommendation[]>([]);
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
            setData(dashboardData);
            setRecommendations(recsData.recommendations || []);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const stats = data?.stats;
    const dashUser = data?.user;

    const cardsDueToday = data?.due_flashcards_count || 0;

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
            desc: `${cardsDueToday} cards due`
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

    // Today progress
    const todayEntry = data?.weekly_progress.find(d =>
        d.date.startsWith(new Date().toISOString().split('T')[0])
    );
    const todayMins = todayEntry?.study_time_minutes || 0;
    const goalMins = dashUser?.daily_goal_minutes || 30;
    const goalPct = Math.min(Math.round((todayMins / goalMins) * 100), 100);

    // Weekly chart
    const weeklyMins = (data?.weekly_progress || []).slice(-7).map(d => d.study_time_minutes);
    const maxWeekly = Math.max(...weeklyMins, 1);
    const totalWeekMins = weeklyMins.reduce((a, b) => a + b, 0);

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
                        {cardsDueToday > 0
                            ? `You have ${cardsDueToday} flashcards to review today.`
                            : "You're all caught up! Great job!"}
                    </p>
                    {/* Streak pill */}
                    {(dashUser?.current_streak || 0) > 0 && (
                        <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/25">
                            <Flame className="w-4 h-4 text-orange-400" />
                            <span className="text-orange-400 text-sm font-medium">{dashUser?.current_streak} day streak</span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2">
                    <Link
                        href="/dashboard/flashcards"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold hover:shadow-glow transition-shadow"
                    >
                        <Play className="w-5 h-5" />
                        Start Studying
                    </Link>
                    {/* Today goal bar */}
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                        <span>Today: {todayMins}/{goalMins} min</span>
                        <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${goalPct >= 100 ? 'bg-green-400' : 'bg-gradient-to-r from-primary-500 to-accent-500'}`}
                                style={{ width: `${goalPct}%` }}
                            />
                        </div>
                        <span className={goalPct >= 100 ? 'text-green-400' : 'text-gray-400'}>{goalPct}%</span>
                    </div>
                </div>
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
                            <p className="text-2xl font-bold text-white">{todayEntry?.cards_reviewed || 0}</p>
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
                            <p className="text-2xl font-bold text-white">{stats?.total_quizzes_taken || 0}</p>
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
                            <p className="text-2xl font-bold text-white">{dashUser?.total_xp || user?.total_xp || 0}</p>
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
                            <span className="text-sm text-gray-400">{totalWeekMins} min this week</span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between gap-2 h-40">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                            const value = weeklyMins[index] || 0;
                            const height = (value / maxWeekly) * 100 || 5;
                            const isToday = index === (new Date().getDay() + 6) % 7;
                            return (
                                <div key={day} className="flex-1 flex flex-col items-center gap-2">
                                    <div
                                        className={`w-full rounded-t-lg transition-all ${isToday
                                            ? 'bg-gradient-to-t from-accent-500 to-primary-400'
                                            : 'bg-gradient-to-t from-primary-500 to-accent-500 opacity-50'}`}
                                        style={{ height: `${height}%`, minHeight: '4px' }}
                                    />
                                    <span className={`text-xs ${isToday ? 'text-primary-400 font-bold' : 'text-gray-500'}`}>{day}</span>
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
                            recommendations.slice(0, 3).map((rec, index) => {
                                const priorityColor = rec.priority === 1 ? 'bg-red-500/20 text-red-400' :
                                    rec.priority === 2 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400';
                                return (
                                    <div
                                        key={index}
                                        className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${priorityColor}`}>
                                            <Target className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium truncate">{rec.title}</p>
                                            <p className="text-gray-400 text-sm">{rec.description}</p>
                                            {rec.estimated_time_minutes > 0 && (
                                                <p className="text-gray-600 text-xs mt-1 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> ~{rec.estimated_time_minutes} min
                                                </p>
                                            )}
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-8">
                                <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                <p className="text-gray-400">Upload documents and start studying to get personalized recommendations!</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Learning Stats */}
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
                        <p className="text-2xl font-bold text-white">{stats?.total_flashcards || 0}</p>
                        <p className="text-gray-400 text-sm">Flashcards</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <Target className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{cardsDueToday}</p>
                        <p className="text-gray-400 text-sm">Due Today</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <TrendingUp className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{dashUser?.current_streak || user?.current_streak || 0}</p>
                        <p className="text-gray-400 text-sm">Day Streak</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
