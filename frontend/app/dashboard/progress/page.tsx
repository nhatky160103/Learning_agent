'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    TrendingUp, Calendar, Target, Flame, Zap,
    Clock, BookOpen, Trophy, Star, ArrowUp, ArrowDown
} from 'lucide-react';
import { progressApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface ProgressStats {
    total_study_time_minutes: number;
    cards_reviewed_today: number;
    cards_reviewed_week: number;
    quizzes_completed: number;
    average_quiz_score: number;
    current_streak: number;
    longest_streak: number;
    total_xp: number;
    weekly_progress: number[];
    topic_mastery: { topic: string; mastery: number; trend: string }[];
}

export default function ProgressPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<ProgressStats | null>(null);
    const [heatmap, setHeatmap] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProgress();
    }, []);

    const loadProgress = async () => {
        try {
            const [dashboardData, heatmapData] = await Promise.all([
                progressApi.getDashboard(),
                progressApi.getHeatmap(90),
            ]);
            setStats(dashboardData);
            setHeatmap(heatmapData.heatmap || {});
        } catch (error) {
            console.error('Failed to load progress:', error);
        } finally {
            setLoading(false);
        }
    };

    const getHeatmapColor = (count: number) => {
        if (count === 0) return 'bg-white/5';
        if (count < 5) return 'bg-green-900/50';
        if (count < 15) return 'bg-green-700/60';
        if (count < 30) return 'bg-green-500/70';
        return 'bg-green-400';
    };

    // Generate last 90 days for heatmap
    const generateHeatmapDays = () => {
        const days = [];
        const today = new Date();
        for (let i = 89; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            days.push(date.toISOString().split('T')[0]);
        }
        return days;
    };

    const heatmapDays = generateHeatmapDays();

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 skeleton rounded-lg" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-32 skeleton rounded-2xl" />
                    ))}
                </div>
                <div className="h-64 skeleton rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Progress</h1>
                <p className="text-gray-400 mt-1">Track your learning journey and achievements</p>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-2xl p-6 hover-lift"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <Flame className="w-6 h-6 text-orange-400 streak-fire" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.current_streak || user?.current_streak || 0}</p>
                            <p className="text-gray-400 text-sm">Day Streak</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Best: {stats?.longest_streak || user?.longest_streak || 0} days</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass rounded-2xl p-6 hover-lift"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                            <Zap className="w-6 h-6 text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.total_xp || user?.total_xp || 0}</p>
                            <p className="text-gray-400 text-sm">Total XP</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass rounded-2xl p-6 hover-lift"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <BookOpen className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.cards_reviewed_week || 0}</p>
                            <p className="text-gray-400 text-sm">Cards This Week</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass rounded-2xl p-6 hover-lift"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Trophy className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.average_quiz_score || 0}%</p>
                            <p className="text-gray-400 text-sm">Avg Quiz Score</p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Activity Heatmap */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass rounded-2xl p-6"
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary-400" />
                        Activity Heatmap
                    </h2>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <span>Less</span>
                        <div className="flex gap-1">
                            <div className="w-3 h-3 rounded-sm bg-white/5" />
                            <div className="w-3 h-3 rounded-sm bg-green-900/50" />
                            <div className="w-3 h-3 rounded-sm bg-green-700/60" />
                            <div className="w-3 h-3 rounded-sm bg-green-500/70" />
                            <div className="w-3 h-3 rounded-sm bg-green-400" />
                        </div>
                        <span>More</span>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-1 overflow-x-auto">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-xs text-gray-500 text-center py-1">{day}</div>
                    ))}

                    {/* Fill empty cells at start */}
                    {Array(new Date(heatmapDays[0]).getDay()).fill(null).map((_, i) => (
                        <div key={`empty-${i}`} />
                    ))}

                    {heatmapDays.map((date) => (
                        <div
                            key={date}
                            className={`aspect-square rounded-sm ${getHeatmapColor(heatmap[date] || 0)}`}
                            title={`${date}: ${heatmap[date] || 0} activities`}
                        />
                    ))}
                </div>
            </motion.div>

            {/* Two Column Layout */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Weekly Progress */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="glass rounded-2xl p-6"
                >
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
                        <TrendingUp className="w-5 h-5 text-green-400" />
                        Weekly Progress
                    </h2>

                    <div className="flex items-end justify-between gap-3 h-48">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                            const value = stats?.weekly_progress?.[index] || 0;
                            const maxValue = Math.max(...(stats?.weekly_progress || [1]), 1);
                            const height = (value / maxValue) * 100 || 10;

                            return (
                                <div key={day} className="flex-1 flex flex-col items-center gap-2">
                                    <span className="text-sm text-gray-400">{value}</span>
                                    <div className="w-full bg-white/5 rounded-t-lg overflow-hidden" style={{ height: '160px' }}>
                                        <div
                                            className="w-full bg-gradient-to-t from-primary-500 to-accent-500 rounded-t-lg transition-all duration-500"
                                            style={{ height: `${height}%`, marginTop: `${100 - height}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500">{day}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 p-4 rounded-xl bg-white/5 flex items-center justify-between">
                        <span className="text-gray-400">Total study time</span>
                        <span className="text-white font-semibold">{stats?.total_study_time_minutes || 0} min</span>
                    </div>
                </motion.div>

                {/* Topic Mastery */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="glass rounded-2xl p-6"
                >
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
                        <Target className="w-5 h-5 text-accent-400" />
                        Topic Mastery
                    </h2>

                    <div className="space-y-4">
                        {stats?.topic_mastery && stats.topic_mastery.length > 0 ? (
                            stats.topic_mastery.slice(0, 5).map((topic, index) => (
                                <div key={index} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white font-medium">{topic.topic}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-400">{topic.mastery}%</span>
                                            {topic.trend === 'up' ? (
                                                <ArrowUp className="w-4 h-4 text-green-400" />
                                            ) : topic.trend === 'down' ? (
                                                <ArrowDown className="w-4 h-4 text-red-400" />
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${topic.mastery}%` }}
                                            transition={{ duration: 0.8, delay: 0.1 * index }}
                                            className={`h-full rounded-full ${topic.mastery >= 80 ? 'bg-green-500' :
                                                    topic.mastery >= 50 ? 'bg-yellow-500' :
                                                        'bg-red-500'
                                                }`}
                                        />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8">
                                <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                <p className="text-gray-400">Start studying to track topic mastery!</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Study Session Summary */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="glass rounded-2xl p-6"
            >
                <h2 className="text-xl font-bold text-white mb-6">Study Summary</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <Clock className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{Math.floor((stats?.total_study_time_minutes || 0) / 60)}h</p>
                        <p className="text-gray-400 text-sm">Total Hours</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <BookOpen className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{stats?.cards_reviewed_week || 0}</p>
                        <p className="text-gray-400 text-sm">Cards Reviewed</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{stats?.quizzes_completed || 0}</p>
                        <p className="text-gray-400 text-sm">Quizzes Taken</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/5">
                        <Star className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-white">{stats?.average_quiz_score || 0}%</p>
                        <p className="text-gray-400 text-sm">Avg Score</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
