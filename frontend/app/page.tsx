'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    BookOpen, Brain, Sparkles, ArrowRight,
    FileText, Layers, Trophy, TrendingUp,
    Zap, Target, Clock, Star
} from 'lucide-react';

const features = [
    {
        icon: FileText,
        title: 'Smart Document Processing',
        description: 'Upload PDFs, DOCX, presentations. AI extracts key concepts and creates study materials automatically.',
        color: 'from-blue-500 to-cyan-500',
    },
    {
        icon: Layers,
        title: 'AI Flashcard Generation',
        description: 'Generate intelligent flashcards with spaced repetition. SM-2 algorithm optimizes your review schedule.',
        color: 'from-purple-500 to-pink-500',
    },
    {
        icon: Target,
        title: 'Adaptive Quizzes',
        description: 'Multiple question types with adaptive difficulty. Get instant feedback and detailed explanations.',
        color: 'from-orange-500 to-red-500',
    },
    {
        icon: TrendingUp,
        title: 'Progress Analytics',
        description: 'Track your learning journey with detailed analytics, streaks, and personalized recommendations.',
        color: 'from-green-500 to-emerald-500',
    },
];

const stats = [
    { value: '10x', label: 'Faster Learning' },
    { value: '95%', label: 'Retention Rate' },
    { value: '24/7', label: 'AI Assistant' },
    { value: '∞', label: 'Flashcards' },
];

export default function HomePage() {
    return (
        <div className="min-h-screen">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                <Brain className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold gradient-text">LearnSmart</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link
                                href="/login"
                                className="text-gray-300 hover:text-white transition-colors"
                            >
                                Login
                            </Link>
                            <Link
                                href="/register"
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:opacity-90 transition-opacity"
                            >
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl" />
                    <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-500/20 rounded-full blur-3xl" />
                </div>

                <div className="max-w-7xl mx-auto relative">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-center"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                            <Sparkles className="w-4 h-4 text-accent-400" />
                            <span className="text-sm text-gray-300">AI-Powered Learning</span>
                        </div>

                        <h1 className="text-5xl md:text-7xl font-bold mb-6">
                            <span className="gradient-text">Smart Learning</span>
                            <br />
                            <span className="text-white">Companion</span>
                        </h1>

                        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
                            Transform your study materials into interactive flashcards and quizzes.
                            Powered by AI, optimized by science.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href="/register"
                                className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold text-lg hover:shadow-glow transition-shadow"
                            >
                                Start Learning Free
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Link>
                            <Link
                                href="#features"
                                className="px-8 py-4 rounded-xl glass text-white font-semibold text-lg hover:bg-white/10 transition-colors"
                            >
                                See Features
                            </Link>
                        </div>
                    </motion.div>

                    {/* Stats */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6"
                    >
                        {stats.map((stat, index) => (
                            <div key={index} className="text-center glass rounded-2xl p-6 hover-lift">
                                <div className="text-4xl font-bold gradient-text mb-2">{stat.value}</div>
                                <div className="text-gray-400">{stat.label}</div>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-4xl font-bold text-white mb-4">
                            Everything You Need to <span className="gradient-text">Excel</span>
                        </h2>
                        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                            Powerful AI tools designed to accelerate your learning journey
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="group glass rounded-2xl p-8 hover-lift"
                            >
                                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                                    <feature.icon className="w-7 h-7 text-white" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
                                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary-900/10 to-transparent" />

                <div className="max-w-7xl mx-auto relative">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-4xl font-bold text-white mb-4">
                            How It <span className="gradient-text">Works</span>
                        </h2>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { step: '01', icon: FileText, title: 'Upload Documents', desc: 'PDF, DOCX, TXT, or presentations' },
                            { step: '02', icon: Zap, title: 'AI Generates Materials', desc: 'Flashcards, quizzes, summaries' },
                            { step: '03', icon: Trophy, title: 'Learn & Track Progress', desc: 'Spaced repetition & analytics' },
                        ].map((item, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.15 }}
                                className="relative"
                            >
                                <div className="glass rounded-2xl p-8 text-center hover-lift h-full">
                                    <div className="text-6xl font-bold text-white/10 absolute top-4 right-4">{item.step}</div>
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-6">
                                        <item.icon className="w-8 h-8 text-white" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                                    <p className="text-gray-400">{item.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="gradient-border rounded-3xl p-12 text-center"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 mb-6">
                            <Star className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm text-gray-300">Start Today - It's Free</span>
                        </div>

                        <h2 className="text-4xl font-bold text-white mb-4">
                            Ready to Transform Your Learning?
                        </h2>
                        <p className="text-xl text-gray-400 mb-8">
                            Join thousands of students achieving their goals with AI-powered study tools.
                        </p>

                        <Link
                            href="/register"
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-gray-900 font-semibold text-lg hover:bg-gray-100 transition-colors"
                        >
                            Get Started for Free
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-white/10">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                <Brain className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-bold text-white">LearnSmart</span>
                        </div>
                        <p className="text-gray-500 text-sm">
                            © 2024 Smart Learning Companion. Made with ❤️ for learners.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
