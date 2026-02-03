import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2 } from 'lucide-react';
import { documentsApi } from '@/lib/api';
import SearchResults from './SearchResults';
import toast from 'react-hot-toast';

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
                const data = await documentsApi.searchInDocument(documentId, debouncedQuery);
                setResults(data.results || []);
            } catch (error) {
                console.error('Search in document failed:', error);
                toast.error('Search failed');
            } finally {
                setLoading(false);
            }
        };

        if (isOpen && debouncedQuery) {
            performSearch();
        }
    }, [debouncedQuery, documentId, isOpen]);

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

                    {/* Results Area */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-4" />
                                <p className="text-gray-400">Searching document content...</p>
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
