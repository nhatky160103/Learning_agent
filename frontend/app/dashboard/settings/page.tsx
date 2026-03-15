'use client';

import { motion } from 'framer-motion';
import { Settings, Wrench, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center max-w-md"
            >
                {/* Icon */}
                <div className="relative mx-auto mb-8 w-24 h-24">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 border border-primary-500/30 flex items-center justify-center">
                        <Settings className="w-12 h-12 text-primary-400 animate-spin" style={{ animationDuration: '8s' }} />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
                        <Wrench className="w-4 h-4 text-yellow-400" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-white mb-3">
                    Under Maintenance
                </h1>
                <p className="text-gray-400 mb-2 text-lg">
                    Settings is coming soon
                </p>
                <p className="text-gray-500 text-sm mb-8">
                    We&apos;re working hard to bring you a great settings experience.
                    Check back later!
                </p>

                {/* ETA */}
                <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 mb-8">
                    <Clock className="w-4 h-4 text-accent-400" />
                    <span className="text-gray-300 text-sm">This feature is under development</span>
                </div>

                {/* Back button */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-medium hover:from-primary-500 hover:to-accent-500 transition-all"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard
                </Link>
            </motion.div>
        </div>
    );
}
