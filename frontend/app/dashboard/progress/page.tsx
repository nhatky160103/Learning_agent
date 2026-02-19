'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Flame, Zap, Clock, Target, TrendingUp, TrendingDown,
    BookOpen, Brain, Award, CheckCircle, Calendar,
    BarChart3, Sparkles, Minus, Trophy, Star
} from 'lucide-react';
import { progressApi } from '@/lib/api';

// ============================================================
// Types
// ============================================================
interface UserResponse {
    id: string;
    username: string;
    full_name?: string;
    total_xp: number;
    current_streak: number;
    longest_streak: number;
    daily_goal_minutes: number;
}

interface UserStats {
    total_documents: number;
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

interface TopicMastery {
    topic_name: string;
    mastery_level: number;
    total_questions: number;
    correct_answers: number;
    last_practiced?: string;
}

interface ProgressDashboard {
    user: UserResponse;
    stats: UserStats;
    weekly_progress: DailyProgress[];
    topic_mastery: TopicMastery[];
    due_flashcards_count: number;
    recommended_topics: string[];
    achievements_count: number;
    recent_achievements: string[];
}

// ============================================================
// Achievement definitions (computed client-side)
// ============================================================
function computeAchievements(data: ProgressDashboard) {
    const { user, stats } = data;
    return [
        {
            id: 'first_upload',
            label: 'First Upload',
            icon: BookOpen,
            color: 'from-blue-500 to-cyan-400',
            unlocked: stats.total_documents >= 1,
            desc: 'Upload your first document',
        },
        {
            id: 'streak_7',
            label: '7-Day Streak',
            icon: Flame,
            color: 'from-orange-500 to-red-400',
            unlocked: user.longest_streak >= 7,
            desc: 'Study 7 days in a row',
        },
        {
            id: 'cards_100',
            label: '100 Cards',
            icon: Brain,
            color: 'from-purple-500 to-pink-400',
            unlocked: stats.total_flashcards >= 100,
            desc: 'Create 100 flashcards',
        },
        {
            id: 'quiz_master',
            label: 'Quiz Master',
            icon: Trophy,
            color: 'from-yellow-500 to-amber-400',
            unlocked: stats.total_quizzes_taken >= 10,
            desc: 'Complete 10 quizzes',
        },
        {
            id: 'scholar_500',
            label: 'Scholar',
            icon: Star,
            color: 'from-green-500 to-emerald-400',
            unlocked: user.total_xp >= 500,
            desc: 'Earn 500 XP',
        },
        {
            id: 'perfectionist',
            label: 'Perfectionist',
            icon: Award,
            color: 'from-rose-500 to-pink-400',
            unlocked: stats.average_accuracy >= 90,
            desc: '90%+ average accuracy',
        },
    ];
}

// ============================================================
// Circular Progress Ring component
// ============================================================
function CircleRing({
    value, max, size = 96, strokeWidth = 8, color = '#8b5cf6',
    children,
}: {
    value: number; max: number; size?: number; strokeWidth?: number;
    color?: string; children?: React.ReactNode;
}) {
    const r = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * r;
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const offset = circ * (1 - pct);

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                {children}
            </div>
        </div>
    );
}

// ============================================================
// Heatmap component (last 12 weeks - dùng /progress/heatmap endpoint)
// ============================================================
function Heatmap({ heatmapData }: { heatmapData: Record<string, number> }) {
    // Build last 84 days (12 weeks)
    const cells: { date: string; minutes: number }[] = [];
    for (let i = 83; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        cells.push({ date: key, minutes: heatmapData[key] || 0 });
    }

    const maxMin = Math.max(...cells.map(c => c.minutes), 1);

    const color = (min: number) => {
        if (min === 0) return 'bg-white/5';
        const p = min / maxMin;
        if (p < 0.25) return 'bg-primary-900/60';
        if (p < 0.5) return 'bg-primary-700/70';
        if (p < 0.75) return 'bg-primary-500/80';
        return 'bg-primary-400';
    };

    // Split into weeks
    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
    }

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div>
            <div className="flex gap-[3px] overflow-x-auto">
                <div className="flex flex-col gap-[3px] mr-1 pt-5">
                    {[0, 1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-3 text-[9px] text-gray-600 leading-3 w-6">{days[i]}</div>
                    ))}
                </div>
                {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((cell, di) => (
                            <div
                                key={di}
                                title={`${cell.date}: ${cell.minutes} min`}
                                className={`w-3 h-3 rounded-[2px] ${color(cell.minutes)} transition-all hover:ring-1 hover:ring-primary-400 cursor-default`}
                            />
                        ))}
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-600">Less</span>
                {['bg-white/5', 'bg-primary-900/60', 'bg-primary-700/70', 'bg-primary-500/80', 'bg-primary-400'].map((c, i) => (
                    <div key={i} className={`w-3 h-3 rounded-[2px] ${c}`} />
                ))}
                <span className="text-xs text-gray-600">More</span>
            </div>
        </div>
    );
}

// ============================================================
// Main Page
// ============================================================
export default function ProgressPage() {
    const [data, setData] = useState<ProgressDashboard | null>(null);
    const [heatmapData, setHeatmapData] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const [d, hm] = await Promise.all([
                progressApi.getDashboard(),
                progressApi.getHeatmap(84),
            ]);
            setData(d);
            // /progress/heatmap trả về { "2025-01-01": 45, ... }
            setHeatmapData(hm || {});
        } catch (e) {
            console.error('Progress load error', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 skeleton rounded-lg" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-32 skeleton rounded-2xl" />)}
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <BookOpen className="w-12 h-12 mb-4 opacity-40" />
                <p>Could not load progress data. Please try again.</p>
            </div>
        );
    }

    const { user, stats, weekly_progress, topic_mastery, due_flashcards_count, recommended_topics } = data;
    const achievements = computeAchievements(data);
    const unlockedCount = achievements.filter(a => a.unlocked).length;

    // Weekly bar chart: 7 ngày gần nhất (index 7..13 của array 14 ngày theo thứ tự tăng dần ngày)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // weekly_progress giờ là 14 ngày, đã sắp xếp từ cũ → mới (index 0 = 13 ngày trước, index 13 = hôm nay)
    const thisWeek = weekly_progress.slice(7);   // 7 ngày gần nhất
    const lastWeek = weekly_progress.slice(0, 7); // 7 ngày trước đó
    const weeklyMins = thisWeek.map(d => d.study_time_minutes);
    const maxWeekly = Math.max(...weeklyMins, 1);
    const totalWeekMins = weeklyMins.reduce((a, b) => a + b, 0);

    // Learning velocity: compare this week vs last week accuracy
    const avgAcc = (arr: DailyProgress[]) => {
        const active = arr.filter(d => d.cards_reviewed > 0 || d.quizzes_taken > 0);
        return active.length ? active.reduce((a, b) => a + b.accuracy, 0) / active.length : 0;
    };
    const thisAcc = avgAcc(thisWeek);
    const lastAcc = avgAcc(lastWeek);
    const velocityDelta = thisAcc - lastAcc;

    // Today's goal progress (hôm nay = phần tử cuối)
    const todayKey = new Date().toISOString().split('T')[0];
    const todayEntry = weekly_progress.find(d => d.date === todayKey || d.date.startsWith(todayKey));
    const todayMins = todayEntry?.study_time_minutes || 0;
    const goalMins = user.daily_goal_minutes || 30;

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-3xl font-bold text-white">Learning Progress</h1>
                <p className="text-gray-400 mt-1">Track your study journey and achievements</p>
            </motion.div>

            {/* Key Stats Row */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
                {/* Streak */}
                <div className="glass rounded-2xl p-5 flex items-center gap-4 hover-lift">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                        <Flame className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-white">{user.current_streak}</p>
                        <p className="text-gray-400 text-sm">Day Streak</p>
                        <p className="text-gray-600 text-xs">Best: {user.longest_streak}d</p>
                    </div>
                </div>

                {/* XP */}
                <div className="glass rounded-2xl p-5 flex items-center gap-4 hover-lift">
                    <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-white">{user.total_xp.toLocaleString()}</p>
                        <p className="text-gray-400 text-sm">Total XP</p>
                    </div>
                </div>

                {/* Accuracy */}
                <div className="glass rounded-2xl p-5 flex items-center gap-4 hover-lift">
                    <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-white">{stats.average_accuracy.toFixed(0)}%</p>
                        <p className="text-gray-400 text-sm">Avg Accuracy</p>
                    </div>
                </div>

                {/* Study Time */}
                <div className="glass rounded-2xl p-5 flex items-center gap-4 hover-lift">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-white">{Math.round(stats.total_study_time_minutes / 60)}h</p>
                        <p className="text-gray-400 text-sm">Total Study</p>
                        <p className="text-gray-600 text-xs">{totalWeekMins} min this week</p>
                    </div>
                </div>
            </motion.div>

            {/* Daily Goal + Learning Velocity */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="grid lg:grid-cols-2 gap-6"
            >
                {/* Daily Goal Ring */}
                <div className="glass rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Target className="w-5 h-5 text-primary-400" />
                        <h2 className="text-xl font-bold text-white">Today's Goal</h2>
                    </div>
                    <div className="flex items-center gap-8">
                        <CircleRing
                            value={todayMins} max={goalMins} size={120} strokeWidth={10}
                            color={todayMins >= goalMins ? '#10b981' : '#8b5cf6'}
                        >
                            <div className="text-center">
                                <p className="text-2xl font-bold text-white">{Math.round((todayMins / goalMins) * 100)}%</p>
                            </div>
                        </CircleRing>
                        <div className="flex-1 space-y-3">
                            <div>
                                <p className="text-gray-400 text-sm">Studied today</p>
                                <p className="text-white font-semibold text-lg">{todayMins} / {goalMins} min</p>
                            </div>
                            <div>
                                <p className="text-gray-400 text-sm">Cards due</p>
                                <p className="text-white font-semibold text-lg">{due_flashcards_count}</p>
                            </div>
                            {todayMins >= goalMins && (
                                <div className="flex items-center gap-2 text-green-400">
                                    <CheckCircle className="w-4 h-4" />
                                    <span className="text-sm font-medium">Goal achieved! 🎉</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Learning Velocity */}
                <div className="glass rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 className="w-5 h-5 text-accent-400" />
                        <h2 className="text-xl font-bold text-white">Learning Velocity</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-4 rounded-xl bg-white/5">
                            <p className="text-gray-400 text-xs mb-1">This Week</p>
                            <p className="text-2xl font-bold text-white">{thisAcc.toFixed(0)}%</p>
                            <p className="text-gray-500 text-xs">accuracy</p>
                        </div>
                        <div className="p-4 rounded-xl bg-white/5">
                            <p className="text-gray-400 text-xs mb-1">Last Week</p>
                            <p className="text-2xl font-bold text-white">{lastAcc.toFixed(0)}%</p>
                            <p className="text-gray-500 text-xs">accuracy</p>
                        </div>
                    </div>
                    <div className={`flex items-center gap-2 p-3 rounded-xl ${velocityDelta > 0 ? 'bg-green-500/10' : velocityDelta < 0 ? 'bg-red-500/10' : 'bg-white/5'}`}>
                        {velocityDelta > 0 ? (
                            <TrendingUp className="w-5 h-5 text-green-400 flex-shrink-0" />
                        ) : velocityDelta < 0 ? (
                            <TrendingDown className="w-5 h-5 text-red-400 flex-shrink-0" />
                        ) : (
                            <Minus className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )}
                        <p className={`text-sm font-medium ${velocityDelta > 0 ? 'text-green-400' : velocityDelta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {velocityDelta > 0 ? `+${velocityDelta.toFixed(1)}% improvement this week!` :
                                velocityDelta < 0 ? `${velocityDelta.toFixed(1)}% — keep pushing!` :
                                    'No change — stay consistent!'}
                        </p>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Overall accuracy</span>
                            <span>{stats.average_accuracy.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all"
                                style={{ width: `${stats.average_accuracy}%` }}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Weekly Chart + Topic Mastery */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Weekly Progress Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white">Weekly Activity</h2>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-400">{totalWeekMins} min this week</span>
                        </div>
                    </div>
                    <div className="flex items-end justify-between gap-2 h-40">
                        {days.map((day, index) => {
                            const value = weeklyMins[index] || 0;
                            const height = (value / maxWeekly) * 100 || 5;
                            const isToday = index === (new Date().getDay() + 6) % 7;
                            return (
                                <div key={day} className="flex-1 flex flex-col items-center gap-2">
                                    <span className="text-xs text-gray-600">{value > 0 ? `${value}m` : ''}</span>
                                    <div
                                        className={`w-full rounded-t-lg transition-all ${isToday
                                            ? 'bg-gradient-to-t from-accent-500 to-primary-400'
                                            : 'bg-gradient-to-t from-primary-600/60 to-primary-500/40'}`}
                                        style={{ height: `${height}%`, minHeight: '4px' }}
                                    />
                                    <span className={`text-xs ${isToday ? 'text-primary-400 font-bold' : 'text-gray-500'}`}>{day}</span>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Topic Mastery */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Brain className="w-5 h-5 text-purple-400" />
                        <h2 className="text-xl font-bold text-white">Topic Mastery</h2>
                    </div>
                    {topic_mastery.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                            <Brain className="w-10 h-10 mb-2 opacity-30" />
                            <p className="text-sm">Complete quizzes to see topic mastery</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                            {topic_mastery.slice(0, 8).map((topic, i) => {
                                const pct = topic.mastery_level;
                                const color = pct >= 80 ? 'from-green-500 to-emerald-400' :
                                    pct >= 50 ? 'from-yellow-500 to-amber-400' :
                                        'from-red-500 to-orange-400';
                                const trend = pct >= 80 ? <TrendingUp className="w-4 h-4 text-green-400" /> :
                                    pct >= 50 ? <Minus className="w-4 h-4 text-yellow-400" /> :
                                        <TrendingDown className="w-4 h-4 text-red-400" />;
                                return (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                {trend}
                                                <span className="text-white text-sm font-medium truncate max-w-[140px]">{topic.topic_name}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">{pct.toFixed(0)}%</span>
                                        </div>
                                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-gradient-to-r ${color} rounded-full transition-all`}
                                                style={{ width: `${Math.max(pct, 2)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {recommended_topics.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Focus on:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {recommended_topics.slice(0, 3).map((t, i) => (
                                    <span key={i} className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs">{t}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Activity Heatmap */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="glass rounded-2xl p-6"
            >
                <div className="flex items-center gap-2 mb-6">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    <h2 className="text-xl font-bold text-white">Activity Heatmap</h2>
                    <span className="text-sm text-gray-500 ml-auto">Last 12 weeks</span>
                </div>
                <Heatmap heatmapData={heatmapData} />
            </motion.div>

            {/* Achievements */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                className="glass rounded-2xl p-6"
            >
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-yellow-400" />
                        <h2 className="text-xl font-bold text-white">Achievements</h2>
                    </div>
                    <span className="text-gray-400 text-sm">{unlockedCount} / {achievements.length} unlocked</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {achievements.map((a) => (
                        <div key={a.id} className={`flex flex-col items-center p-4 rounded-xl text-center transition-all ${a.unlocked ? 'bg-white/10 hover:bg-white/15' : 'bg-white/3 opacity-40 grayscale'}`}>
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${a.color} flex items-center justify-center mb-3 ${a.unlocked ? '' : 'opacity-50'}`}>
                                <a.icon className="w-6 h-6 text-white" />
                            </div>
                            <p className="text-white text-xs font-semibold mb-1">{a.label}</p>
                            <p className="text-gray-500 text-xs leading-tight">{a.desc}</p>
                            {a.unlocked && (
                                <span className="mt-2 text-xs text-green-400 font-medium">✓ Unlocked</span>
                            )}
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Study Summary */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="glass rounded-2xl p-6"
            >
                <h2 className="text-xl font-bold text-white mb-4">All-Time Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-500/10', value: stats.total_documents, label: 'Documents' },
                        { icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10', value: stats.total_flashcards, label: 'Flashcards' },
                        { icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-500/10', value: stats.total_quizzes_taken, label: 'Quizzes' },
                        { icon: Clock, color: 'text-green-400', bg: 'bg-green-500/10', value: `${Math.round(stats.total_study_time_minutes / 60)}h ${stats.total_study_time_minutes % 60}m`, label: 'Study Time' },
                    ].map((item, i) => (
                        <div key={i} className={`flex flex-col items-center p-4 rounded-xl ${item.bg}`}>
                            <item.icon className={`w-8 h-8 ${item.color} mb-2`} />
                            <p className="text-2xl font-bold text-white">{item.value}</p>
                            <p className="text-gray-400 text-sm">{item.label}</p>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
