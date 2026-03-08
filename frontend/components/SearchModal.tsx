import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, Zap, GitMerge, Layers } from 'lucide-react';
import { chatApi } from '@/lib/api';
import SearchResults from './SearchResults';
import toast from 'react-hot-toast';

type SearchMode = 'hybrid' | 'semantic' | 'multi_query';

const SEARCH_MODES: { value: SearchMode; label: string; icon: any; desc: string }[] = [
    { value: 'hybrid',      label: 'Hybrid',      icon: GitMerge, desc: 'BM25 + Vector (best)' },
    { value: 'semantic',    label: 'Semantic',    icon: Zap,      desc: 'Vector only (fast)' },
    { value: 'multi_query', label: 'Multi-Query', icon: Layers,   desc: 'Multiple variations' },
];

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
    filename: string;
    initialQuery?: string;
}

export default function SearchModal({ isOpen, onClose, documentId, filename, initialQuery = '' }: SearchModalProps) {
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [mode, setMode] = useState<SearchMode>('hybrid');

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 600);
        return () => clearTimeout(timer);
    }, [query]);

    // Perform search
    useEffect(() => {
        const performSearch = async () => {
            if (!debouncedQuery || debouncedQuery.length < 3) return;

            setLoading(true);
            try {
                const data = await chatApi.searchDocuments(debouncedQuery, documentId, mode);
                // Normalize format từ chat API → format SearchResults expect
                const normalized = (data.results || []).map((r: any) => ({
                    content: r.text || r.content || '',
                    score: r.relevance_score ?? r.score ?? 0,
                    metadata: r.metadata ?? {
                        document_id: r.document_id,
                        title: r.document_title || 'Unknown',
                        file_type: '',
                    }
                }));
                setResults(normalized);
            } catch (error) {
                console.error('Search failed:', error);
                toast.error('Search failed');
            } finally {
                setLoading(false);
            }
        };

        if (isOpen && debouncedQuery) {
            performSearch();
        }
    }, [debouncedQuery, documentId, isOpen, mode]);

    // Reset or Initialize when opened/closed
    useEffect(() => {
        if (isOpen) {
            if (initialQuery) {
                setQuery(initialQuery);
                setDebouncedQuery(initialQuery);
            }
        } else {
            setQuery('');
            setDebouncedQuery('');
            setResults([]);
        }
    }, [isOpen, initialQuery]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col border border-white/20"
                >
                    {/* Header with Search Input */}
                    <div className="p-4 border-b border-white/10 flex items-center gap-4 bg-white/5 bg-opacity-30 rounded-t-2xl">
                        <Search className="w-5 h-5 text-primary-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Search inside "${filename}"...`}
                            className="flex-1 bg-transparent border-none text-white text-lg placeholder-gray-400 focus:ring-0 focus:outline-none"
                            autoFocus
                        />
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Mode Selector */}
                    <div className="px-4 py-2 border-b border-white/10 flex gap-2">
                        {SEARCH_MODES.map(({ value, label, icon: Icon, desc }) => (
                            <button
                                key={value}
                                onClick={() => setMode(value)}
                                title={desc}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                    mode === value
                                        ? 'bg-primary-500/30 text-primary-300 border border-primary-500/50'
                                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                            </button>
                        ))}
                        <span className="ml-auto text-xs text-gray-500 self-center">
                            {SEARCH_MODES.find(m => m.value === mode)?.desc}
                        </span>
                    </div>

                    {/* Results Area */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-4" />
                                <p className="text-gray-400">Searching with {mode} mode...</p>
                            </div>
                        )}

                        {!loading && query.length > 0 && query.length < 3 && (
                            <div className="text-center py-12 text-gray-500">
                                Type at least 3 characters to search...
                            </div>
                        )}

                        {!loading && results.length > 0 && (
                            <SearchResults results={results} loading={false} query={query} />
                        )}

                        {!loading && query.length >= 3 && results.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                No relevant passages found.
                            </div>
                        )}

                        {!loading && query.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>Enter a query to find semantic matches in this document.</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
