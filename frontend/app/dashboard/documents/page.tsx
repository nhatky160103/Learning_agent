'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, FileText, File, Trash2, Eye, Loader2,
    CheckCircle, Clock, AlertCircle, Search, Plus,
    Layers, Brain, BookOpen, BarChart2, Map, ChevronDown, ChevronUp, X,
    GitMerge, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { documentsApi, flashcardsApi, chatApi } from '@/lib/api';
import SearchResults from '@/components/SearchResults';
import SearchModal from '@/components/SearchModal';

interface Document {
    id: string;
    filename: string;
    original_filename: string;
    file_type: string;
    file_size: number;
    status: string;
    summary?: string;
    created_at: string;
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDeepSearch, setIsDeepSearch] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [deepSearchMode, setDeepSearchMode] = useState<'hybrid' | 'semantic' | 'multi_query'>('hybrid');
    const [generatingFlashcards, setGeneratingFlashcards] = useState<string | null>(null);
    const [searchModalDoc, setSearchModalDoc] = useState<Document | null>(null);
    const [reviewDoc, setReviewDoc] = useState<any | null>(null);
    const [reviewLoading, setReviewLoading] = useState<string | null>(null);
    const [studyGuideDoc, setStudyGuideDoc] = useState<any | null>(null);
    const [studyGuideLoading, setStudyGuideLoading] = useState<string | null>(null);
    const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

    useEffect(() => {
        loadDocuments();
    }, []);

    // Poll for document status updates
    useEffect(() => {
        const hasProcessingDocs = documents.some(doc => doc.status === 'processing' || doc.status === 'uploading');

        if (!hasProcessingDocs) return;

        const interval = setInterval(() => {
            loadDocuments();
        }, 5000);

        return () => clearInterval(interval);
    }, [documents]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isDeepSearch && searchQuery.length > 2) {
                performDeepSearch();
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [searchQuery, isDeepSearch, deepSearchMode]);

    const performDeepSearch = async () => {
        setIsSearching(true);
        try {
            const data = await chatApi.searchDocuments(searchQuery, undefined, deepSearchMode);
            // Normalize format
            const normalized = (data.results || []).map((r: any) => ({
                content: r.text || r.content || '',
                score: r.relevance_score ?? r.score ?? 0,
                metadata: r.metadata ?? {
                    document_id: r.document_id,
                    title: r.document_title || 'Unknown',
                    file_type: '',
                }
            }));
            setSearchResults(normalized);
        } catch (error) {
            console.error('Search failed:', error);
            toast.error('Search failed');
        } finally {
            setIsSearching(false);
        }
    };

    const loadDocuments = async () => {
        try {
            const data = await documentsApi.list();
            setDocuments(data);
        } catch (error) {
            console.error('Failed to load documents:', error);
            toast.error('Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        setUploading(true);

        for (const file of acceptedFiles) {
            try {
                await documentsApi.upload(file);
                toast.success(`Uploaded ${file.name}`);
            } catch (error: any) {
                toast.error(`Failed to upload ${file.name}`);
            }
        }

        await loadDocuments();
        setUploading(false);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'text/plain': ['.txt'],
            'text/markdown': ['.md'],
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
        },
        multiple: true,
    });

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this document?')) return;

        try {
            await documentsApi.delete(id);
            setDocuments(docs => docs.filter(d => d.id !== id));
            toast.success('Document deleted');
        } catch (error) {
            toast.error('Failed to delete document');
        }
    };

    const handleGenerateFlashcards = async (doc: Document) => {
        setGeneratingFlashcards(doc.id);
        try {
            const result = await flashcardsApi.generateFlashcards({
                document_id: doc.id,
                deck_name: `${doc.original_filename} Flashcards`,
                count: 10,
            });
            toast.success(`Generated ${result.cards?.length || 0} flashcards!`);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to generate flashcards');
        } finally {
            setGeneratingFlashcards(null);
        }
    };

    const handleReview = async (doc: Document) => {
        setReviewLoading(doc.id);
        try {
            const data = await documentsApi.review(doc.id);
            setReviewDoc({ ...data, docTitle: doc.original_filename });
        } catch (error) {
            toast.error('Failed to generate review');
        } finally {
            setReviewLoading(null);
        }
    };

    const handleStudyGuide = async (doc: Document) => {
        setStudyGuideLoading(doc.id);
        try {
            const data = await documentsApi.studyGuide(doc.id);
            setStudyGuideDoc({ ...data, docTitle: doc.original_filename });
        } catch (error) {
            toast.error('Failed to generate study guide');
        } finally {
            setStudyGuideLoading(null);
        }
    };

    const filteredDocs = documents.filter(doc =>
        doc.original_filename?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'processed':
            case 'ready': // Added 'ready' based on backend response
                return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'processing':
                return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
            case 'failed':
            case 'error':
                return <AlertCircle className="w-4 h-4 text-red-400" />;
            default:
                return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };

    const getFileIcon = (type: string) => {
        if (!type) return '📁';
        if (type.includes('pdf')) return '📄';
        if (type.includes('word') || type.includes('doc')) return '📝';
        if (type.includes('presentation') || type.includes('ppt')) return '📊';
        if (type.includes('text') || type.includes('markdown')) return '📃';
        return '📁';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Documents</h1>
                    <p className="text-gray-400 mt-1">Upload and manage your study materials</p>
                </div>

                <div className="flex items-center gap-4">
                    {/* Deep Search Toggle + Mode */}
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                        <span className={`text-sm ${isDeepSearch ? 'text-primary-400 font-medium' : 'text-gray-400'}`}>
                            Deep Search
                        </span>
                        <button
                            onClick={() => setIsDeepSearch(!isDeepSearch)}
                            className={`w-10 h-6 rounded-full flex items-center transition-colors p-1 ${isDeepSearch ? 'bg-primary-500' : 'bg-gray-600'}`}
                        >
                            <motion.div
                                layout
                                className="bg-white w-4 h-4 rounded-full shadow-lg"
                                animate={{ x: isDeepSearch ? 16 : 0 }}
                            />
                        </button>
                        {/* Mode buttons — chỉ hiện khi Deep Search bật */}
                        {isDeepSearch && (
                            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-white/10">
                                <button
                                    onClick={() => setDeepSearchMode('hybrid')}
                                    title="BM25 + Vector (best)"
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all ${deepSearchMode === 'hybrid'
                                            ? 'bg-primary-500/30 text-primary-300'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                >
                                    <GitMerge className="w-3 h-3" /> Hybrid
                                </button>
                                <button
                                    onClick={() => setDeepSearchMode('semantic')}
                                    title="Vector only (fast)"
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all ${deepSearchMode === 'semantic'
                                            ? 'bg-primary-500/30 text-primary-300'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                >
                                    <Zap className="w-3 h-3" /> Semantic
                                </button>
                                <button
                                    onClick={() => setDeepSearchMode('multi_query')}
                                    title="Multiple query variations"
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all ${deepSearchMode === 'multi_query'
                                            ? 'bg-primary-500/30 text-primary-300'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                >
                                    <Layers className="w-3 h-3" /> Multi
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={isDeepSearch ? "Search by concept..." : "Filter by name..."}
                            className={`pl-10 pr-4 py-2.5 bg-white/5 border rounded-xl text-white placeholder-gray-500 focus:outline-none w-full md:w-64 transition-all ${isDeepSearch
                                ? 'border-primary-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                : 'border-white/10 focus:border-primary-500'
                                }`}
                        />
                    </div>
                </div>
            </div>

            {isDeepSearch && searchQuery ? (
                <div className="mt-6">
                    <SearchResults
                        results={searchResults}
                        loading={isSearching}
                        query={searchQuery}
                        onResultClick={(result) => {
                            // Find full document object to pass to modal
                            const doc = documents.find(d => d.id === result.metadata.document_id);
                            if (doc) {
                                setSearchModalDoc(doc);
                            }
                        }}
                    />
                </div>
            ) : (
                <>
                    {/* Upload Zone */}
                    {/* Upload Zone */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div
                            {...getRootProps()}
                            className={`glass rounded-2xl p-8 border-2 border-dashed transition-colors cursor-pointer ${isDragActive ? 'border-primary-500 bg-primary-500/10' : 'border-white/20 hover:border-white/40'
                                }`}
                        >
                            <input {...getInputProps()} />
                            <div className="text-center">
                                {uploading ? (
                                    <Loader2 className="w-12 h-12 text-primary-400 mx-auto mb-4 animate-spin" />
                                ) : (
                                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                )}
                                <p className="text-white text-lg font-medium mb-2">
                                    {isDragActive ? 'Drop files here...' : 'Drag & drop files here'}
                                </p>
                                <p className="text-gray-400 text-sm">
                                    or click to browse • Supports PDF, DOCX, TXT, MD, PPTX
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Documents List */}
                    {loading ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="h-48 skeleton rounded-2xl" />
                            ))}
                        </div>
                    ) : filteredDocs.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-white mb-2">No documents yet</h3>
                            <p className="text-gray-400">Upload your first document to get started</p>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
                        >
                            <AnimatePresence>
                                {filteredDocs.map((doc) => (
                                    <motion.div
                                        key={doc.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="glass rounded-2xl p-6 hover-lift group"
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <span className="text-4xl">{getFileIcon(doc.file_type)}</span>
                                            <div className="flex items-center gap-1">
                                                {getStatusIcon(doc.status)}
                                                <span className="text-xs text-gray-400 capitalize">{doc.status}</span>
                                            </div>
                                        </div>

                                        <h3 className="text-white font-semibold mb-2 truncate" title={doc.original_filename}>
                                            {doc.original_filename}
                                        </h3>

                                        <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                                            {doc.summary || 'Processing...'}
                                        </p>

                                        <div className="flex items-center justify-between text-sm text-gray-500">
                                            <span>{formatFileSize(doc.file_size)}</span>
                                            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                                        </div>

                                        {/* Actions */}
                                        <div className="mt-4 pt-4 border-t border-white/10">
                                            {/* Row 1: Main actions */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <button
                                                    onClick={() => handleGenerateFlashcards(doc)}
                                                    disabled={(doc.status !== 'ready' && doc.status !== 'processed') || generatingFlashcards === doc.id}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                                >
                                                    {generatingFlashcards === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                                                    Cards
                                                </button>
                                                <button
                                                    onClick={() => handleReview(doc)}
                                                    disabled={(doc.status !== 'ready' && doc.status !== 'processed') || reviewLoading === doc.id}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                                >
                                                    {reviewLoading === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                                                    Review
                                                </button>
                                                <button
                                                    onClick={() => handleStudyGuide(doc)}
                                                    disabled={(doc.status !== 'ready' && doc.status !== 'processed') || studyGuideLoading === doc.id}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                                >
                                                    {studyGuideLoading === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                                                    Guide
                                                </button>
                                            </div>
                                            {/* Row 2: Secondary actions */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setSearchModalDoc(doc)}
                                                    disabled={doc.status !== 'ready' && doc.status !== 'processed'}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                                >
                                                    <Search className="w-3.5 h-3.5" /> Search
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(doc.id)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-medium"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </>
            )}

            {/* Review Modal */}
            <AnimatePresence>
                {reviewDoc && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setReviewDoc(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="glass rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <Brain className="w-6 h-6 text-purple-400" />
                                    <h2 className="text-xl font-bold text-white">AI Review</h2>
                                </div>
                                <button onClick={() => setReviewDoc(null)} className="p-2 rounded-lg hover:bg-white/10 text-gray-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-gray-400 text-sm mb-6">{reviewDoc.docTitle}</p>

                            {reviewDoc.review && (
                                <div className="space-y-5">
                                    {/* Overview */}
                                    <div className="bg-white/5 rounded-xl p-4">
                                        <p className="text-gray-200 leading-relaxed">{reviewDoc.review.overview}</p>
                                        <div className="flex gap-3 mt-3">
                                            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs">{reviewDoc.review.difficulty_level}</span>
                                            <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs">~{reviewDoc.review.estimated_study_time_minutes} min</span>
                                            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs">Quality: {reviewDoc.review.quality_score}/10</span>
                                        </div>
                                    </div>

                                    {/* Key Concepts */}
                                    {reviewDoc.review.key_concepts?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                                                <Brain className="w-4 h-4 text-purple-400" /> Key Concepts
                                            </h3>
                                            <div className="space-y-2">
                                                {reviewDoc.review.key_concepts.map((c: any, i: number) => (
                                                    <div key={i} className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                                                        <span className={`mt-0.5 px-2 py-0.5 rounded text-xs ${c.importance === 'high' ? 'bg-red-500/20 text-red-300' :
                                                                c.importance === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                                                                    'bg-gray-500/20 text-gray-300'
                                                            }`}>{c.importance}</span>
                                                        <div>
                                                            <p className="text-white font-medium">{c.concept}</p>
                                                            <p className="text-gray-400 text-sm">{c.brief_explanation}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Learning Objectives */}
                                    {reviewDoc.review.learning_objectives?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3">🎯 Learning Objectives</h3>
                                            <ul className="space-y-2">
                                                {reviewDoc.review.learning_objectives.map((obj: string, i: number) => (
                                                    <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                                                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                                                        {obj}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Study Recommendations */}
                                    {reviewDoc.review.study_recommendations?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3">📚 Study Strategies</h3>
                                            <div className="space-y-2">
                                                {reviewDoc.review.study_recommendations.map((r: any, i: number) => (
                                                    <div key={i} className="bg-white/5 rounded-lg p-3">
                                                        <p className="text-white font-medium text-sm">{r.strategy}</p>
                                                        <p className="text-gray-400 text-xs mt-1">{r.description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Quiz Topics */}
                                    {reviewDoc.review.potential_quiz_topics?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3">❓ Potential Quiz Topics</h3>
                                            <div className="flex flex-wrap gap-2">
                                                {reviewDoc.review.potential_quiz_topics.map((t: string, i: number) => (
                                                    <span key={i} className="px-3 py-1 rounded-full bg-white/10 text-gray-300 text-xs">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Study Guide Modal */}
            <AnimatePresence>
                {studyGuideDoc && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setStudyGuideDoc(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="glass rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <BookOpen className="w-6 h-6 text-green-400" />
                                    <h2 className="text-xl font-bold text-white">Study Guide</h2>
                                </div>
                                <button onClick={() => setStudyGuideDoc(null)} className="p-2 rounded-lg hover:bg-white/10 text-gray-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-gray-400 text-sm mb-6">{studyGuideDoc.docTitle}</p>

                            {studyGuideDoc.study_guide && (
                                <div className="space-y-5">
                                    {/* Outline */}
                                    {studyGuideDoc.study_guide.outline?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3">📋 Outline</h3>
                                            <div className="space-y-3">
                                                {studyGuideDoc.study_guide.outline.map((section: any, i: number) => (
                                                    <div key={i} className="bg-white/5 rounded-xl p-4">
                                                        <p className="text-white font-medium mb-2">{section.section}</p>
                                                        <p className="text-gray-400 text-xs mb-3 italic">{section.summary}</p>
                                                        <ul className="space-y-1">
                                                            {section.key_points?.map((pt: string, j: number) => (
                                                                <li key={j} className="text-gray-300 text-sm flex items-start gap-2">
                                                                    <span className="text-primary-400 mt-0.5">•</span> {pt}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Must Know Facts */}
                                    {studyGuideDoc.study_guide.must_know_facts?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3">⚡ Must-Know Facts</h3>
                                            <ul className="space-y-2">
                                                {studyGuideDoc.study_guide.must_know_facts.map((f: string, i: number) => (
                                                    <li key={i} className="flex items-start gap-2 text-gray-300 text-sm bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                                                        <span className="text-yellow-400 shrink-0">★</span> {f}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Memory Aids */}
                                    {studyGuideDoc.study_guide.memory_aids?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3">🧠 Memory Aids</h3>
                                            <div className="space-y-2">
                                                {studyGuideDoc.study_guide.memory_aids.map((m: any, i: number) => (
                                                    <div key={i} className="bg-white/5 rounded-lg p-3">
                                                        <p className="text-white text-sm font-medium">{m.concept}</p>
                                                        <p className="text-accent-400 text-sm mt-1">💡 {m.mnemonic}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Quick Review Checklist */}
                                    {studyGuideDoc.study_guide.quick_review_checklist?.length > 0 && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-3">✅ Self-Check</h3>
                                            <ul className="space-y-2">
                                                {studyGuideDoc.study_guide.quick_review_checklist.map((q: string, i: number) => (
                                                    <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                                                        <input type="checkbox" className="rounded accent-primary-500" />
                                                        {q}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Search Modal */}
            <SearchModal
                isOpen={!!searchModalDoc}
                onClose={() => setSearchModalDoc(null)}
                documentId={searchModalDoc?.id || ''}
                filename={searchModalDoc?.original_filename || ''}
                initialQuery={searchQuery}
            />
        </div>
    );
}
