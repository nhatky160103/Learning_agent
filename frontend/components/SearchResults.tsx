import { motion } from 'framer-motion';
import { FileText, ArrowRight, Brain } from 'lucide-react';

interface SearchResult {
    content: string;
    score: number;
    metadata: {
        document_id: string;
        title: string;
        file_type: string;
        page_number?: number;
    };
}

interface SearchResultsProps {
    results: SearchResult[];
    loading: boolean;
    query: string;
    onResultClick?: (result: SearchResult) => void;
}

export default function SearchResults({ results, loading, query, onResultClick }: SearchResultsProps) {
    if (loading) {
        return (
            <div className="space-y-4 mt-6">
                <div className="flex items-center gap-2 text-primary-400 mb-2">
                    <Brain className="w-5 h-5 animate-pulse" />
                    <span className="text-sm font-medium">Deep Searching...</span>
                </div>
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="glass p-4 rounded-xl space-y-3 animate-pulse">
                        <div className="h-4 bg-white/10 rounded w-3/4" />
                        <div className="h-4 bg-white/10 rounded w-full" />
                        <div className="h-3 bg-white/5 rounded w-1/4" />
                    </div>
                ))}
            </div>
        );
    }

    if (!query) return null;

    if (results.length === 0) {
        return (
            <div className="text-center py-8 text-gray-400">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No relevant concepts found for "{query}"</p>
                <p className="text-sm opacity-60 mt-1">Try different keywords or upload more documents</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary-400" />
                    Relevant Passages
                </h3>
                <span className="text-xs text-primary-400 bg-primary-500/10 px-2 py-1 rounded-full border border-primary-500/20">
                    AI-Powered
                </span>
            </div>

            <div className="grid gap-4">
                {results.map((result, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="glass p-5 rounded-xl border border-white/5 hover:border-primary-500/30 transition-colors group cursor-pointer"
                        onClick={() => onResultClick && onResultClick(result)}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2 text-primary-300 text-sm font-medium">
                                <FileText className="w-4 h-4" />
                                <span className="truncate max-w-[200px]">{result.metadata.title}</span>
                            </div>
                            <span className="text-xs font-mono text-gray-500 bg-black/20 px-2 py-0.5 rounded">
                                {Math.round(result.score * 100)}% match
                            </span>
                        </div>

                        <p className="text-gray-300 text-sm leading-relaxed mb-3 line-clamp-3 group-hover:line-clamp-none transition-all">
                            "...{(result.content || '').trim()}..."
                        </p>

                        <div className="flex items-center justify-end">
                            <button
                                className="text-xs text-primary-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                            >
                                View Context <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
